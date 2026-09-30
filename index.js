/**
 * Ark image generation tool for DSH.
 *
 * Registers one Host tool that calls the Volcano Ark (Volcano Engine) image API,
 * which speaks the OpenAI `POST /images/generations` dialect. Two behaviours are
 * deliberate and load-bearing:
 *
 * 1. Ark image URLs expire after 24 hours, so every successful generation is
 *    fetched and written into the workspace immediately (or decoded from
 *    `b64_json` when the caller asked for base64).
 * 2. The tool has no package dependencies: it uses only Node built-ins and the
 *    injected `tools`/`attachments` services, so it resolves no matter which DSH
 *    installation the profile is pinned to.
 *
 * @module dsh-ark-image
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

/** Tool name as the model sees it. */
const TOOL_NAME = 'ark_generate_image'

/** Ark rejects a `size` that is neither a tier label nor `WxH`. */
const SIZE_PATTERN = /^(1K|2K|3K|4K|\d{3,5}x\d{3,5})$/i

const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Ark image model ids, newest first. Only a model the account has actually
 * opened can be called; Ark answers with an "not activated" style message
 * otherwise, which `execute` surfaces with a hint.
 */
const MODELS = [
  'doubao-seedream-5-0-pro-260628',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-5-0-lite-260128',
  'doubao-seedream-4-5-251128',
  'doubao-seedream-4-0-250828',
]

/** Model used when neither the call nor the row config names one. */
const DEFAULT_MODEL = 'doubao-seedream-5-0-pro-260628'

export const name = 'ark-image'

/**
 * Services this plugin reads.
 *
 * Cordis gates every `ctx.<name>` access on this declaration, so a service that
 * is used but not declared throws at the point of use rather than at load.
 * `attachments` was missing here and only surfaced on the first real
 * generation, because the test double provided it unconditionally.
 *
 * The declaration must be an array of names or a name-to-config map -- Cordis
 * normalizes `Object.keys(inject)` into a dependency map, so a nested
 * `{required, optional}` object would silently register services literally
 * named "required" and "optional". Both entries therefore sit in one array;
 * the code treats a missing `ctx.attachments` as "save the file, skip the
 * inline preview".
 *
 * `workspaceRegistry` resolves the calling session's working directory. Cordis
 * refuses undeclared property access, so it has to be listed even though the
 * plugin degrades gracefully when it is absent.
 */
export const inject = ['tools', 'attachments', 'workspaceRegistry']

/**
 * Configuration shape and defaults.
 *
 * Cordis 4 reads `Config["~standard"].validate(...)` -- the Standard Schema
 * contract -- and rejects anything without that member. This hand-written
 * schema implements the contract directly instead of importing zod, which
 * keeps the plugin dependency-free: a published dsh keeps zod behind a hashed
 * pnpm path that is not resolvable from an installed bundle.
 */
const CONFIG_FIELDS = {
  apiKey: {
    kind: 'string',
    description:
      'Ark API key. When omitted, ARK_API_KEY from the environment is used.',
  },
  baseUrl: {
    kind: 'string',
    default: 'https://ark.cn-beijing.volces.com/api/v3',
    description: 'Ark API base URL, without a trailing slash.',
  },
  model: {
    kind: 'string',
    default: DEFAULT_MODEL,
    description:
      'Default model id used when a call omits `model`. Must be a model the Ark account has opened.',
  },
  outputDir: {
    kind: 'string',
    default: 'generated-images',
    description:
      'Directory for saved images, relative to the session working directory unless absolute.',
  },
  timeoutMs: {
    kind: 'number',
    default: 180000,
    description: 'Per-request timeout in milliseconds.',
  },
}

/**
 * Validate one config candidate, applying defaults.
 *
 * @param {unknown} candidate - Raw config from the loader row.
 * @returns {{value: Record<string, unknown>} | {issues: Array<{message: string, path?: string[]}>}} Validation outcome.
 */
function validateConfig(candidate) {
  const input = candidate === null || candidate === undefined ? {} : candidate
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { issues: [{ message: 'config must be an object' }] }
  }

  const source = /** @type {Record<string, unknown>} */ (input)
  const value = {}
  const issues = []

  for (const [key, spec] of Object.entries(CONFIG_FIELDS)) {
    const raw = source[key]
    if (raw === undefined || raw === null) {
      if ('default' in spec) value[key] = spec.default
      continue
    }
    if (spec.kind === 'string') {
      if (typeof raw !== 'string') {
        issues.push({ message: `\`${key}\` must be a string`, path: [key] })
        continue
      }
      value[key] = raw
      continue
    }
    if (spec.kind === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        issues.push({ message: `\`${key}\` must be a finite number`, path: [key] })
        continue
      }
      value[key] = raw
      continue
    }
    value[key] = raw
  }

  for (const key of Object.keys(source)) {
    if (!(key in CONFIG_FIELDS)) {
      issues.push({ message: `unknown config field \`${key}\``, path: [key] })
    }
  }

  if (issues.length > 0) return { issues }
  return { value }
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-ark-image',
    /** @param {unknown} value - Candidate config. */
    validate: validateConfig,
  },
  /** JSON Schema view of the same shape, for tooling that renders it. */
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(CONFIG_FIELDS).map(([key, spec]) => [
        key,
        {
          type: spec.kind,
          ...('default' in spec ? { default: spec.default } : {}),
          description: spec.description,
        },
      ]),
    ),
  },
}

/**
 * Pick a file extension from a media type, falling back to the magic bytes.
 *
 * @param {string | null} mediaType - `Content-Type` reported by Ark or the fetch.
 * @param {Uint8Array} bytes - Encoded image bytes.
 * @returns {string} A bare extension without the dot.
 */
function extensionFor(mediaType, bytes) {
  const normalized = (mediaType ?? '').split(';')[0].trim().toLowerCase()
  if (EXTENSIONS[normalized] !== undefined) return EXTENSIONS[normalized]
  if (bytes.length >= 8) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'webp'
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  }
  return 'png'
}

/**
 * Narrow a caller- or Ark-reported media type to one the attachment service accepts.
 *
 * @param {string | null} mediaType - Candidate media type.
 * @param {Uint8Array} bytes - Encoded image bytes used as the fallback signal.
 * @returns {'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'} Accepted media type.
 */
function imageMediaType(mediaType, bytes) {
  const normalized = (mediaType ?? '').split(';')[0].trim().toLowerCase()
  if (Object.hasOwn(EXTENSIONS, normalized)) return /** @type {any} */ (normalized)
  const extension = extensionFor(normalized, bytes)
  if (extension === 'jpg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  return 'image/png'
}

/**
 * Windows refuses to create files whose base name is a reserved device name,
 * however the extension is spelled: `con.png`, `NUL.png`, `lpt1.jpg` all fail.
 * The character rules below cannot catch these because the names are legal text,
 * so they have to be rejected by name.
 */
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul', 'clock$',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

/**
 * Build a filesystem-safe basename fragment from a prompt.
 *
 * @param {string} prompt - The generation prompt.
 * @returns {string} At most 40 characters of slug, or `image` when nothing survives.
 */
function slug(prompt) {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  if (cleaned.length === 0) return 'image'
  return RESERVED_NAMES.has(cleaned) ? `${cleaned}-image` : cleaned
}

/**
 * Sanitize a caller-supplied base filename.
 *
 * @param {string} name - Raw `outputName` argument.
 * @returns {string | null} A safe base name, or null when it supplied no usable characters.
 */
function safeBaseName(name) {
  const cleaned = String(name).trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, '-')
  if (cleaned.length === 0) return null
  // A name of only dots would resolve to a directory reference.
  if (/^\.+$/.test(cleaned)) return null
  return RESERVED_NAMES.has(cleaned.replace(/\..*$/, '').toLowerCase())
    ? `${cleaned}-image`
    : cleaned
}

/**
 * Find the directory the session that triggered this call is working in.
 *
 * `process.cwd()` is the wrong answer: the Host inherits the directory of the
 * launcher that started it, not the session's workspace, so a relative
 * `outputDir` was landing beside the launcher's own scripts.
 *
 * The workspace registry owns the session-to-directory mapping, so it is asked
 * first. Everything is best-effort: an unavailable registry, an unlisted
 * session, or a throwing call all fall back to `process.cwd()` rather than
 * failing a generation over a directory choice.
 *
 * @param {any} registry - `ctx.workspaceRegistry`, possibly undefined.
 * @param {string | undefined} sessionId - The calling agent's session id.
 * @returns {string | null} A directory path, or null when none could be found.
 */
function workspaceRootFor(registry, sessionId) {
  if (registry === undefined || registry === null) return null
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  try {
    const workspaces = registry.list()
    if (!Array.isArray(workspaces)) return null
    for (const workspace of workspaces) {
      const ids = workspace?.sessionIds
      if (Array.isArray(ids) && ids.includes(sessionId) && typeof workspace.path === 'string') {
        return workspace.path
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Resolve the directory images are written into.
 *
 * A flat `generated-images/` becomes a junk drawer within a few hundred images,
 * so the date is appended as a subdirectory: `generated-images/2026-09-30/`.
 * The configured path stays the stable root the user can rely on.
 *
 * @param {string} outputDir - Configured directory, possibly relative.
 * @param {string} cwd - Session working directory.
 * @param {Date} now - Clock, injected so the result is testable.
 * @returns {string} An absolute directory path including the date folder.
 */
function resolveOutputDir(outputDir, cwd, now = new Date()) {
  const root = isAbsolute(outputDir) ? outputDir : resolve(cwd, outputDir)
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return join(root, `${year}-${month}-${day}`)
}

/**
 * Turn an Ark HTTP failure into a message that says what to fix.
 *
 * @param {number} status - HTTP status returned by Ark.
 * @param {string} body - Response body, already read as text.
 * @param {string} model - Model id the failed request asked for.
 * @returns {string} An actionable error message.
 */
function describeHttpFailure(status, body, model) {
  const detail = body.slice(0, 600)
  if (status === 401 || status === 403) {
    return `Ark rejected the API key (HTTP ${status}). Check that ARK_API_KEY holds the full key VALUE, not the key's display name.\n`
      + `火山方舟拒绝了 API Key（HTTP ${status}）。请确认填的是 Key 本身（ark- 开头的一长串），而不是你在控制台给它起的名字。\n`
      + `Ark said / 服务端返回：${detail}`
  }
  if (status === 404) {
    return `Ark does not recognise model "${model}" (HTTP 404). Activate it in the Ark console first, or pass a different \`model\`.\n`
      + `火山方舟不认识模型 "${model}"（HTTP 404）。请先在控制台「开通管理」里开通它，或换一个已开通的模型。\n`
      + `Ark said / 服务端返回：${detail}`
  }
  if (status === 429) {
    return `Ark rate limited the request (HTTP 429). Wait and retry, or lower the request rate.\n`
      + `请求过于频繁（HTTP 429）。等一会儿再试，或降低调用频率。\n`
      + `Ark said / 服务端返回：${detail}`
  }
  return `Ark returned HTTP ${status} / 火山方舟返回 HTTP ${status}：${detail}`
}

/**
 * Register the Ark image tool.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - Plugin context.
 * @param {Record<string, unknown>} config - Validated row config.
 * @returns {void}
 */
export function apply(ctx, config) {
  const baseUrl = String(config.baseUrl ?? '').replace(/\/+$/, '')
  const defaultModel = String(config.model ?? DEFAULT_MODEL)
  const outputDir = String(config.outputDir ?? 'generated-images')
  const timeoutMs = Number(config.timeoutMs ?? 180000)
  const configuredKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''

  /**
   * Read the Ark API key from the row config, then the environment.
   *
   * @returns {string | undefined} The key, or undefined when unset.
   */
  function apiKey() {
    if (configuredKey.length > 0) return configuredKey
    const fromEnv = process.env.ARK_API_KEY
    return typeof fromEnv === 'string' && fromEnv.trim().length > 0 ? fromEnv.trim() : undefined
  }

  ctx.effect(() =>
    ctx.tools.register({
      name: TOOL_NAME,
      description: [
        'Generate an image from a text prompt with Volcano Ark (Doubao Seedream).',
        'The generated image is downloaded immediately and saved into the session working directory,',
        'so the returned path stays valid after the provider URL expires.',
        'Use it whenever the user asks for a picture, illustration, poster, product shot, icon, or any other raster image.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'What to draw. Write a detailed visual description; Ark models follow concrete scene, subject, style, lighting, and composition wording far better than keywords.',
          },
          model: {
            type: 'string',
            enum: MODELS,
            description:
              'Override the model. 5.0 Pro is single-image refinement and does not support grouped output or 4K; 5.0 Lite supports 2K/3K/4K and grouped output.',
          },
          size: {
            type: 'string',
            description:
              'Output size: a tier label (1K, 2K, 3K, 4K) or explicit WxH such as 1024x1024. Defaults to 2K.',
          },
          n: {
            type: 'integer',
            minimum: 1,
            maximum: 4,
            description: 'How many images to generate. Defaults to 1.',
          },
          watermark: {
            type: 'boolean',
            description: 'Whether Ark adds its watermark. Defaults to false.',
          },
          outputName: {
            type: 'string',
            description:
              'Optional base filename without an extension. Defaults to a slug derived from the prompt plus a timestamp.',
          },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            saved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  bytes: { type: 'integer' },
                  // Present only when the attachment service accepted the image;
                  // `render` uses it to show the picture inline.
                  attachment: { type: 'object' },
                  width: { type: 'integer' },
                  height: { type: 'integer' },
                },
                required: ['path'],
                additionalProperties: false,
              },
            },
            usage: { type: 'string' },
          },
          required: ['model', 'saved'],
          additionalProperties: false,
        },
        /**
         * Render the saved images plus their paths as tool content.
         *
         * @param {unknown} _args - Original tool arguments (unused).
         * @param {any} value - The tool's returned value.
         * @returns {any[]} Text and image content blocks.
         */
        render(_args, value) {
          const saved = Array.isArray(value?.saved) ? value.saved : []
          const lines = [`model: ${value?.model ?? '(unknown)'}`]
          for (const entry of saved) {
            lines.push(`saved: ${entry.path}${entry.width ? ` (${entry.width}x${entry.height})` : ''}`)
          }
          if (value?.usage) lines.push(value.usage)
          const blocks = [{ type: 'text', text: lines.join('\n') }]
          for (const entry of saved) {
            if (entry.attachment) blocks.push({ type: 'image', attachment: entry.attachment })
          }
          return blocks
        },
      },
      async execute(args, exec) {
        const key = apiKey()
        if (key === undefined) {
          throw new Error(
            'Ark API key is missing. Set the ARK_API_KEY environment variable, or put `apiKey` in the ark-image row config.\n' +
            '缺少火山方舟 API Key。请设置环境变量 ARK_API_KEY，或在 ark-image 这一行的 config 里填 `apiKey`。\n' +
            '\n' +
            'How to get one / 怎么获取：\n' +
            '  1. https://console.volcengine.com/ark - sign up and complete real-name verification (注册并完成实名认证)\n' +
            '  2. API Key management - create a key, copy the value starting with "ark-" (API Key 管理 - 创建并复制 ark- 开头的那串)\n' +
            '  3. Activate the Doubao-Seedream model (在「开通管理」里开通 Doubao-Seedream 模型)\n' +
            '  Windows: setx ARK_API_KEY "your-key"    then restart Harness (设完必须重启 Harness)\n' +
            '\n' +
            'Note: the key VALUE is what is needed, not the key NAME you gave it. (要的是 Key 本身，不是你给它起的名字。)',
          )
        }

        const prompt = String(args.prompt ?? '').trim()
        if (prompt.length === 0) {
          throw new Error('`prompt` must not be empty. / `prompt` 不能为空。')
        }

        const model = typeof args.model === 'string' && args.model.length > 0 ? args.model : defaultModel
        const size = args.size === undefined ? '2K' : String(args.size).trim()
        if (!SIZE_PATTERN.test(size)) {
          throw new Error(
            `Invalid size "${size}". Use a tier label (1K, 2K, 3K, 4K) or WxH such as 1024x1024.\n` +
            `尺寸 "${size}" 无效。请用档位（1K / 2K / 3K / 4K），或具体尺寸如 1024x1024。`,
          )
        }
        const count = args.n === undefined ? 1 : Number(args.n)
        if (!Number.isInteger(count) || count < 1 || count > 4) {
          throw new Error('`n` must be an integer between 1 and 4. / `n` 必须是 1 到 4 之间的整数。')
        }

        const body = {
          model,
          prompt,
          size,
          n: count,
          watermark: args.watermark === true,
          response_format: 'url',
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const onAbort = () => controller.abort()
        exec.signal?.addEventListener('abort', onAbort, { once: true })

        let payload
        try {
          const response = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
          const text = await response.text()
          if (!response.ok) {
            throw new Error(describeHttpFailure(response.status, text, model))
          }
          try {
            payload = JSON.parse(text)
          } catch {
            throw new Error(`Ark returned a non-JSON body / 火山方舟返回了非 JSON 内容：${text.slice(0, 300)}`)
          }
        } finally {
          clearTimeout(timer)
          exec.signal?.removeEventListener('abort', onAbort)
        }

        const entries = Array.isArray(payload?.data) ? payload.data : []
        if (entries.length === 0) {
          throw new Error(`Ark returned no image / 火山方舟没有返回图片。Raw response / 原始响应：${JSON.stringify(payload).slice(0, 600)}`)
        }

        const generatedAt = new Date()
        // Prefer the calling session's workspace; fall back to the process
        // directory only when the registry cannot answer.
        const sessionId = exec.agent?.id
        const baseDir = workspaceRootFor(ctx.workspaceRegistry, sessionId) ?? process.cwd()
        const directory = resolveOutputDir(outputDir, baseDir, generatedAt)
        await mkdir(directory, { recursive: true })

        // The date now lives in the directory, so the filename carries the time
        // to the second; a prompt-only name would collide on a second request.
        const stamp = generatedAt.toISOString().slice(11, 19).replace(/:/g, '')
        const requested = typeof args.outputName === 'string' ? safeBaseName(args.outputName) : null
        const base = requested ?? `${slug(prompt)}-${stamp}`

        const saved = []
        for (const [index, entry] of entries.entries()) {
          let bytes
          let reportedType = null

          if (typeof entry?.b64_json === 'string' && entry.b64_json.length > 0) {
            bytes = new Uint8Array(Buffer.from(entry.b64_json, 'base64'))
          } else if (typeof entry?.url === 'string' && entry.url.length > 0) {
            const imageResponse = await fetch(entry.url, { signal: controller.signal })
            if (!imageResponse.ok) {
              throw new Error(`Failed to download the generated image / 下载生成的图片失败：HTTP ${imageResponse.status}`)
            }
            reportedType = imageResponse.headers.get('content-type')
            bytes = new Uint8Array(await imageResponse.arrayBuffer())
          } else {
            continue
          }

          const mediaType = imageMediaType(reportedType, bytes)
          const extension = EXTENSIONS[mediaType] ?? 'png'
          const suffix = entries.length > 1 ? `-${index + 1}` : ''
          const path = join(directory, `${base}${suffix}.${extension}`)
          await writeFile(path, bytes)

          const record = { path, bytes: bytes.byteLength }
          if (ctx.attachments !== undefined) {
            try {
              const ref = await ctx.attachments.saveImage({
                data: bytes,
                mediaType,
                name: `${base}${suffix}.${extension}`,
              })
              record.attachment = ref
              record.width = ref.width
              record.height = ref.height
            } catch (error) {
              ctx.logger?.warn?.(`ark-image: attachment save failed: ${String(error)}`)
            }
          }
          saved.push(record)
        }

        if (saved.length === 0) {
          throw new Error('Ark reported images but none carried a `url` or `b64_json` field. / 火山方舟报告有图片，但都没有 `url` 或 `b64_json` 字段。')
        }

        let usage
        const totalTokens = payload?.usage?.total_tokens
        if (typeof totalTokens === 'number') usage = `usage: ${totalTokens} tokens`

        return { model, saved, ...(usage === undefined ? {} : { usage }) }
      },
    }),
  )
}
