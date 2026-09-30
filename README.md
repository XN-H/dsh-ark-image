# dsh-ark-image

Volcano Ark (Doubao Seedream) image generation tool for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

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

Adds one tool — `ark_generate_image` — that turns a text prompt into an image, saves it
into the session workspace, and shows it inline in the conversation.

> **English summary** — A dependency-free DSH bundle that registers an image-generation
> tool backed by Volcano Ark. Requires your own Ark API key. Install with
> `dsh plugin --profile <name> add <package-or-tarball>`. Full documentation is in
> Chinese below.

---

## 它做什么

给 DeepSeek Harness 加一个画图工具。你说「画一张 XXX」，模型就会调用它，图会：

1. **立刻下载并保存**到你的会话工作区（不是留一个会过期的链接）
2. **显示在对话里**（不是只给你一个文件路径）
3. **按日期分文件夹**存放，不会堆成一团

```
D:\你的项目\generated-images\2026-09-30\a-vast-open-sea-085550.jpg
```

---

## 安装

### 前置条件

1. **DeepSeek Harness**（CLI 或桌面版均可）
2. **火山方舟 API Key** —— 免费注册，见下方「获取 API Key」

### 方式一：从 tarball 安装（推荐，不需要任何构建授权）

```sh
dsh plugin --profile <你的profile> add ./dsh-ark-image-0.1.2.tgz
```

### 方式二：从 npm 安装

```sh
dsh plugin --profile <你的profile> add dsh-ark-image
```

### 方式三：从本地目录安装（开发时用）

```sh
dsh plugin --profile <你的profile> add /path/to/dsh-ark-image
```

> **桌面版用户**：打开「插件」→「添加插件」，在输入框里填包名或本地路径，点安装。
> 安装后**需要重启 Harness**，插件才会生效。

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

## 常见问题

**装完没反应 / 看不到工具？**

插件变更后**必须重启 Harness**。桌面版要**完全退出**（右键托盘 → 退出），
点窗口 X 只是最小化。

**报「Ark API key is missing」？**

Key 没读到。注意：`setx` 设置的环境变量**只在 Harness 下次启动时生效**，
当前运行的进程读不到。

**报 404 / 模型不存在？**

该模型没在火山方舟开通。去控制台「开通管理」里开通，或换一个已开通的模型。

**报 401 / 403？**

Key 不对。确认填的是 **Key 本身**（`ark-` 开头的一长串），而不是 Key 的**名字**。

**图存到奇怪的地方了？**

检查 `outputDir` 配置。默认会存到**会话工作区**下的 `generated-images/日期/`。

**生成很慢？**

正常。实测 2K 图约 **35 秒**，其中 **98% 是 API 生成时间**，下载和写盘只占 2%。
想快就降分辨率（1K 大约快 3-4 倍）。

---

## 许可证

[MIT](./LICENSE)

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [火山方舟文档](https://www.volcengine.com/docs/82379)
- [插件开发文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
