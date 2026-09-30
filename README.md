# dsh-ark-image

**DeepSeek Harness 生图插件** —— 文生图 / 图片生成 / AI 绘画，基于**火山方舟 Seedream（豆包）**。零依赖，纯 JavaScript，无需构建。

**DSH image generation plugin for DeepSeek Harness** — text-to-image powered by **Volcano Ark Seedream (Doubao)**. Zero dependencies, plain JavaScript, no build step.

关键词 / Keywords：`dsh` `dsh-plugin` `deepseek-harness` `生图` `文生图` `图片生成` `AI 绘画` `火山方舟` `豆包` `Seedream` `Doubao` `Volcano Ark` `image-generation` `text-to-image`

---

## 先说清楚：这个插件是给谁用的

> **这不是 [`dsh-image-gen`](https://github.com/shanliuling/dsh-image-gen) 的替代品。**

| 你想要的 | 该用哪个 |
|---|---|
| 图生图、图片编辑、AI 画布 | **[`dsh-image-gen`](https://github.com/shanliuling/dsh-image-gen)** —— 功能完整，8 个 Provider，有图库 |
| 切换阿里云 / Gemini / OpenAI / Grok 等多个生图服务 | 同上 |
| 本地 ComfyUI | 同上 |
| **只想"说句话就出图"，然后忘掉这个插件的存在** | **这个** |

**这个插件的取舍是刻意做窄的**：

- ✅ **零运行时依赖** —— 没有依赖，就不会因为依赖出问题
- ✅ **没有构建步骤** —— 不会出现"装完加载失败"（pnpm 默认拒绝执行插件的构建脚本，有 `prepare` 的包首次安装会失败，需要用户手动放行；本插件没有脚本可跑，所以不会）
- ✅ **全部代码可通读** —— 一个文件，你可以自己看懂每一行
- ❌ **只有 1 个 Provider**（火山方舟）
- ❌ **只能文生图**，不能改图
- ❌ **没有图库 / 画布 / 批量对比**

**如果你的需求在上表"该用哪个"那一列命中前者，请直接用 `dsh-image-gen`——它做得比我好，这不是客套。**

---

> ## ⚠️ 非官方项目 / Unofficial project
>
> 本项目是**第三方社区插件**，由个人开发者独立编写与维护。
>
> - **与 DeepSeek 无隶属、赞助或背书关系。** "DeepSeek"、"DeepSeek Harness" 等名称仅用于说明本插件所兼容的平台。
> - **与火山引擎 / 火山方舟（Volcano Engine / Volcano Ark）无隶属、赞助或背书关系。** 插件通过其公开 API 调用图像生成能力，你需要自行注册账号并承担相应费用。
> - 本插件按 MIT 许可证分发，**不提供任何担保**。使用前请自行评估。
>
> **This is an unofficial community plugin, independently written and maintained.**
> It is not affiliated with, endorsed by, or sponsored by DeepSeek or Volcano Engine.
> Those names are used only to describe compatibility and the API this plugin calls.
> Distributed under the MIT licence, with no warranty.

---

## 它做什么

给 DeepSeek Harness 加一个画图工具。你说「画一张 XXX」，模型就会调用它，图会：

1. **立刻下载并保存**到你的会话工作区（不是留一个会过期的链接）
2. **显示在对话里**（不是只给你一个文件路径）
3. **按日期分文件夹**存放，不会堆成一团

```
D:\你的项目\generated-images\2026-09-30\a-vast-open-sea-085550.jpg
```

> **English summary** — Adds one tool, `ark_generate_image`, that turns a text prompt into
> an image, downloads it immediately into the session workspace (Ark URLs expire), and
> shows it inline in the conversation. A dependency-free DSH bundle backed by Volcano Ark;
> you supply your own API key. Install with `dsh plugin --profile <name> add dsh-ark-image`.
> The rest of this document is in Chinese.
>
> **Scope** — Deliberately narrow: one provider, text-to-image only, zero dependencies,
> no build step. It is *not* a replacement for
> [`dsh-image-gen`](https://github.com/shanliuling/dsh-image-gen); if you need image
> editing, a gallery, or multiple providers, use that instead.

---

## 安装

### 前置条件

1. **DeepSeek Harness** —— 已经有就跳过
   - 桌面版：[deepseek.com/harness](https://www.deepseek.com/harness/) 下载安装包（Windows / macOS），自带运行时，不用预装环境
   - 命令行版：装 [Node.js](https://nodejs.org/)（`^22.19.0` 或 `>= 24`）后 `npx @deepseek-ai/dsh web`
2. **火山方舟 API Key** —— 见下方「获取 API Key」

> 两个版本可以共存，会话记录共用，**但插件要分别安装**。

---

## 安装插件

在 Harness 里装插件有**两种入口**：图形界面（桌面版）和命令行。选一个即可。

### 入口一：桌面版图形界面（推荐）

1. 打开 Harness，点左侧边栏的 **「插件」**
2. 点右上角的 **「+ 添加插件」**
3. 在输入框里填 **`dsh-ark-image`**
4. 点 **「安装」**，等它跑完（约 5 秒）
5. **完全退出 Harness，再重新打开**

> ⚠️ **第 5 步最容易漏**：桌面版点窗口右上角的 **X 只是最小化到托盘**，插件不会生效。
> 要**右键托盘图标 → 退出**，再重新打开。

**装好的标志**：重启后，插件列表里能看到 `dsh-ark-image`，且能用自然语言让它画图。

> ⚠️ **为什么填包名而不是 GitHub 地址？**
>
> 图形界面在安装前会先**查一次包信息**（用于显示预览、校验兼容性），而这一步
> **只支持 npm 上的包**。填 `github:` 地址会在这一步失败并报
> 「无法获取插件信息」——**这不是包的问题，是界面的限制**。
>
> 命令行没有这个预检查，所以命令行可以用 GitHub 地址。见下一个入口。

### 入口二：命令行

```sh
# 从 npm 安装（推荐）
dsh plugin --profile <你的profile> add dsh-ark-image

# 或从 GitHub 源码安装（不需要构建授权，见下）
dsh plugin --profile <你的profile> add github:XN-H/dsh-ark-image
```

`<你的profile>` 通常是 `desktop`（桌面版）或 `web`（命令行版）。不确定就用 `list` 查：

```sh
dsh plugin --profile desktop list      # 看当前装了哪些插件
dsh plugin --profile desktop remove dsh-ark-image   # 卸载
```

### 关于输入框里填什么

那个输入框接受四种来源：

| 填什么 | 例子 | 界面能用吗 | 需要构建授权吗 |
|---|---|---|---|
| **npm 包名**（推荐） | `dsh-ark-image` | ✅ 能 | ❌ 不需要 |
| GitHub 地址 | `github:XN-H/dsh-ark-image` | ❌ **界面查询会失败** | ❌ 不需要 |
| 本地目录路径 | `D:\你的路径\dsh-ark-image` | ⚠️ 未验证 | ❌ 不需要 |
| tarball 文件 | `D:\你的路径\dsh-ark-image-<版本>.tgz` | ⚠️ 未验证 | ❌ 不需要 |

**结论：在图形界面里，请填 npm 包名 `dsh-ark-image`。**
其余三种在界面里可能失败——用命令行则四种都可以。

> **为什么本项目从 GitHub 装不需要授权？**
>
> pnpm ≥10 默认拒绝执行 git 依赖的构建脚本，所以**有 `prepare`/`build` 步骤的包**
> 从 GitHub 安装时，第一次会失败，需要你在 profile 的 `pnpm-workspace.yaml` 里写：
>
> ```yaml
> allowBuilds:
>   <包名>: true
> ```
>
> **本项目是纯 JavaScript、零依赖、没有 `scripts` 字段**，没有构建步骤，
> 所以 pnpm 没有任何脚本要跑，**不需要这项授权**。
>
> ⚠️ 这个结论**只对本项目成立**。装别的插件时，如果第一次失败并提示
> `allowBuilds`，那是正常流程——但请意识到：**那等于允许该插件的代码
> 在你的机器上安装期执行**，只对可信来源授权。

### 另一种省事的方式：插件市场

Harness 生态里有个社区插件市场 **DSH Plugin Hub**，能浏览 4600+ 个插件、
点卡片安装，并会**在安装前预检**（比如拦下有 GitHub 构建坑的包）：

```sh
dsh plugin --profile desktop add dsh-plugin
```

装完重启，在 **设置 → 插件中心** 里浏览。适合"随便看看有什么好玩的"，
但**装本插件不需要绕这一圈**——直接在「添加插件」里填 GitHub 地址更快。

---

## 出问题了？按这张表自查

**先按顺序走这三步**，大部分问题到这就解决了：

1. **完全退出 Harness 再打开**（桌面版要右键托盘 → 退出，点窗口 X 只是最小化）
2. **确认 Key 读到了**：在 Harness 里问 AI「帮我看一下 ARK_API_KEY 环境变量有没有设置」
3. **确认模型开通了**：去 [火山方舟控制台](https://console.volcengine.com/ark) → 开通管理 → 看 `Doubao-Seedream` 是否已开通

### 症状对照表

| 你看到的 | 原因 | 怎么修 |
|---|---|---|
| 插件列表里没有 `dsh-ark-image` | 没装成功，或没重启 | 重新在「插件」页安装，然后**完全退出** Harness |
| 装的时候报网络错误 / 一直转圈 | 连不上 GitHub 或 npm | 换网络；或改用本地目录 / tarball 安装 |
| 报「已存在」/ 加载冲突 | `node_modules` 里有残留 | 先 `remove` 卸载，重启，再装 |
| AI 说它没有画图工具 | 插件没激活 | 完全退出 Harness 再打开（**不是**点 X） |
| 报 `Ark API key is missing` | Key 没读到 | 见下一节「Key 相关」 |
| 报 `401` / `403` | Key 不对 | 见下一节「Key 相关」 |
| 报 `404` | 模型没开通 | 控制台「开通管理」里开通，或换模型 |
| 报 `429` | 请求太频繁 | 等一会儿再试 |
| 图存到奇怪的地方 | `outputDir` 配置 | 见「配置项」，默认存会话工作区 |
| 生成很慢（30 秒以上） | **正常** | 实测 98% 是 API 生成时间。想快就用 `1K` |

### Key 相关

**Key 从哪读？** 优先级：插件配置里的 `apiKey` → 环境变量 `ARK_API_KEY`

**为什么 `setx` 之后还是不行？**

环境变量**只在进程启动时读取一次**。`setx` 只影响之后新启动的程序，
所以**必须重启 Harness**。

**怎么确认 Key 设对了？**

```powershell
# Windows：查用户环境变量（不会显示完整值，只看长度）
[Environment]::GetEnvironmentVariable("ARK_API_KEY","User").Length
# 应该输出 46 左右
```

> ⚠️ **注意**：控制台里你给 Key 起的**名字**（比如 `ds-picture`）**不是 Key**。
> 要的是创建时那串 `ark-` 开头的**值**。很多平台只在创建时显示一次，
> 看不到就**重新创建一个**。

**不想用环境变量？** 直接在插件配置里填：

```yaml
- id: ark-image
  name: dsh-ark-image
  config:
    apiKey: 你的Key
```

（改完同样要重启 Harness）

---

## 获取 API Key

1. 打开 [火山方舟控制台](https://console.volcengine.com/ark)
2. 注册并完成实名认证
3. 左侧「API Key 管理」→ 创建一个 Key
4. 复制那串 Key（`ark-` 开头）
5. 开通 **Doubao-Seedream** 模型（在「开通管理」里）

### 配置 Key（三选一，按优先级）

**方式 A：环境变量（推荐）**

```powershell
# Windows
setx ARK_API_KEY "你的Key"
```

```sh
# macOS / Linux
export ARK_API_KEY="你的Key"      # 加到 ~/.bashrc 或 ~/.zshrc 里可持久化
```

设置后**需要重启 Harness**。

**方式 B：插件配置**

在你 profile 的 `cordis.patch.yml` 里给这一行加 `apiKey`：

```yaml
- id: ark-image
  name: dsh-ark-image
  config:
    apiKey: 你的Key
```

**方式 C：桌面版设置界面**

在「插件」页面找到 `ark-image` 这一行，编辑它的配置，填入 `apiKey`。

---

## 使用

直接跟模型说就行，不需要记命令：

> 画一张：山脊上空的银河，长曝光，不要文字

模型会调用工具，参数由它自动填。你也可以明确指定：

| 参数 | 说明 | 默认 |
|---|---|---|
| `prompt` | **（必填）** 画面描述。详细描述效果远好于堆关键词 | — |
| `model` | 换模型，见下方「模型」 | `doubao-seedream-5-0-pro-260628` |
| `size` | 分辨率档位 `1K`/`2K`/`3K`/`4K`，或具体尺寸如 `1024x1024` | `2K` |
| `n` | 生成几张（1-4） | `1` |
| `watermark` | 是否加水印 | `false` |
| `outputName` | 指定文件名（不含扩展名） | 由提示词+时间生成 |

### 模型

| 模型 ID | 特点 |
|---|---|
| `doubao-seedream-5-0-pro-260628` | 单张精修，质量最高（默认） |
| `doubao-seedream-5-0-260128` | 5.0 标准版 |
| `doubao-seedream-5-0-lite-260128` | 支持 2K/3K/4K 与组图，速度更快 |
| `doubao-seedream-4-5-251128` | 上一代 |
| `doubao-seedream-4-0-250828` | 上一代 |

> **注意**：只有你在火山方舟**开通**过的模型才能调用，否则会报 404。

---

## 配置项

在你 profile 的 `cordis.patch.yml` 中覆盖：

```yaml
- id: ark-image
  name: dsh-ark-image
  config:
    baseUrl: https://ark.cn-beijing.volces.com/api/v3   # API 地址
    model: doubao-seedream-5-0-pro-260628               # 默认模型
    outputDir: generated-images                          # 输出目录（相对工作区）
    timeoutMs: 180000                                    # 单次请求超时（毫秒）
    apiKey: ''                                           # 留空则读 ARK_API_KEY 环境变量
```

`outputDir` 可以是相对路径（相对**会话工作区**）或绝对路径。

---

## 设计说明

这些是实现上的取舍，供二次开发参考：

**零依赖。** 插件只 import Node 内置模块（`node:fs/promises`、`node:path`），
不依赖任何 `@deepseek-ai/*` 包。原因是发布版 dsh 把 zod 等依赖藏在带哈希的 pnpm
路径下，从已安装的 bundle 里解析不到；自己实现所需接口比赌一个解析路径更稳。

**图片立刻转存。** 火山方舟返回的图片 URL **24 小时后失效**，所以插件拿到响应后
立刻下载并写入工作区，返回的本地路径永久有效。

**输出到会话工作区，不是进程目录。** Host 进程的工作目录是启动器所在目录，
不是你的项目目录。插件通过 `workspaceRegistry` 找到会话对应的工作区，
取不到时才回退到进程目录。

**Windows 保留名处理。** `CON`、`PRN`、`NUL`、`LPT1` 等是 Windows 保留设备名，
无法用作文件名。插件会自动把这类名字改成 `con-image.png` 这样的安全形式。

**文件名与目录。** 目录按日期分层（`generated-images/2026-09-30/`），
文件名带秒级时间戳，避免连续生成时覆盖。

---

## 许可证

[MIT](./LICENSE)

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [火山方舟文档](https://www.volcengine.com/docs/82379)
- [插件开发文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
