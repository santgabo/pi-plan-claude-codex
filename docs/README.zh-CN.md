# Pi 计划模式

> 🌐 其他语言：[English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Português](README.pt.md) | [日本語](README.ja.md)。

一个为 Pi-agent v1 or later 添加对话式规划能力的 TypeScript 扩展：探索项目、澄清决策、提出有用的改进建议，并在实施之前呈现计划。软件包：`pi-plan-claude-codex`，版本 `0.1.1`。

工作流程借鉴了 [Codex planning](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) 和 [Claude Code 计划评审与批准](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan)。实现面向 Pi-agent v1 or later 的公开扩展 API；后续主版本可能需要重新检查兼容性。

## 安装与使用

安装一次该软件包：

```sh
pi install npm:pi-plan-claude-codex
```

然后像往常一样，从任意项目启动 Pi：

```sh
pi
```

在对话中激活该模式：

```text
/plan
```

在 TUI 中，也可以使用固定快捷键 **Ctrl+Alt+P**（macOS 上为 **Ctrl+Option+P**）切换模式，效果与不带参数的 `/plan` 相同。它保留编辑器草稿和当前提案，不向模型发送请求，且**绝不会批准或执行计划**。关闭模式会恢复之前的工具。在当前轮次仍在运行时，按下快捷键只会显示警告，不会中断工作，也不会安排稍后切换。

在 macOS 上，如有需要，请将终端配置为把 Option 作为 Alt/Meta 发送。Pi 的原生对话框保留键盘焦点；这不是全局快捷键。如果终端、操作系统或其他快捷键拦截了此组合，请改用 `/plan`。

现在用普通消息描述你的目标，例如：“我想添加目录搜索功能；请先调查其工作原理，并在做决定之前提出改进建议。”

安装会将该软件包注册到 Pi 的个人配置中。后续启动时会自动加载，从而使 `/plan` 可用。使用该命令或键盘快捷键激活模式；启动时不需要传递路径或标志。也支持 `/plan <request>` 作为快捷方式。

安装本地检出副本（包括首次发布到 npm 之前），请运行：

```sh
pi install /absolute/path/to/pi-plan-claude-codex
```

然后使用相同的 `pi` → `/plan` 工作流程。

要求 Pi-agent v1 or later 和 Node.js `>=22.19.0`。Pi 直接加载 TypeScript，无需事先编译，并提供 `peerDependencies` 中声明的依赖。

## 工作流程

1. **调查（Investigate）。** 阅读项目说明并探索实现。首先查找智能体可以自行发现的事实。
2. **讨论（Discuss）。** 澄清目标、范围、约束和成功标准。提出有用的 UX、简洁性或行为改进，说明其权衡，并询问是否纳入。
3. **确定决策（Resolve decisions）。** 确定接口、方案、错误处理、兼容性和验证方式。访谈会根据任务调整：通常每个问题解决一个决策，最多一次问三个相关问题，不设最少轮数，也不问填充式问题。
4. **评审（Review）。** 呈现完整的 Markdown 计划，包括已接受的决策、可验证的步骤、测试和假设。由用户选择下一步。

问题可以提供带权衡和推荐的选项，也支持自由回答。取消提问将使该决策保持未答复状态并停止本轮。模型被指示保留先前的决策，未经批准不得扩大范围。访谈质量和计划完整性还取决于所选模型。

呈现计划后，可用操作如下：

- **继续规划（Continue planning）：** 保留待定提案和只读限制。
- **完善计划（Refine the plan）：** 请求反馈并生成新修订版。
- **在当前对话中执行（Execute in this conversation）：** 恢复之前的工具，并按照已批准的计划开始实施。
- **在干净会话中执行（Execute in a clean session）：** 创建不带访谈历史的新会话，并传递完整计划、其来源、模型、推理级别和之前的工具。

取消评审将保持模式激活。批准仅对该提案和该会话有效。新信息会使之前的提案失效；对已失效对话框的延迟回复不能启动执行。如果取消创建干净会话，则返回继续规划。

## 命令

| 命令 | 结果 |
| --- | --- |
| `/plan` | 切换计划模式。 |
| Ctrl+Alt+P（macOS：Ctrl+Option+P） | 在 TUI 中执行与 `/plan` 相同的切换。 |
| `/plan <request>` | 启用模式并开始规划该请求。 |
| `/plan on` | 启用，但不向模型发送请求。 |
| `/plan off` | 禁用模式并恢复之前的工具。 |
| `/plan status` | 显示模式、修订版、状态和 Markdown 文件。 |
| `/plan review` | 再次显示提案和选择器；重试失败的导出。 |
| `/plan execute` | 打开相同的评审选择器；必须选择一个操作。 |
| `/plan refine [comments]` | 使用注释完善提案，或打开输入框以填写注释。 |
| `--plan` | 如果分支没有保存的状态，则以计划模式启动。 |

模式切换发生在智能体空闲时。将“执行该计划”写成普通消息仍会使智能体停留在规划模式：请通过命令或明确的执行选项进行转换。`/plan off` 会结束模式限制，但不会自动开始实施。

## 允许的探索

激活期间，启用 `read`、`grep`、`find`、`ls` 和三个内置工具：

| 工具 | 用途 |
| --- | --- |
| `plan_ask` | 提问，可带选项或自由回答。 |
| `plan_submit` | 保存并呈现提案；不批准执行。 |
| `plan_inspect` | 固定的 Git 查询：`status`、`diff`、`log` 和 `show`。 |

先前已激活的外部工具在声明 `readOnlyHint: true` 且未声明 `destructiveHint: true` 时可继续可用。未知或有变更作用的工具将被阻止，包括嵌套调用，同时被阻止的还有 `bash`、`powershell`、`codemode`、`write`、`edit` 以及用户的 `!`/`!!` 命令。

`plan_inspect` 使用直接参数、无 shell、固定操作、已验证的引用、禁用外部 diff 和 textconv 的选项、十秒超时和有界输出。测试、构建、脚本和安装必须等待批准执行后进行。如果计划需要依赖这些操作才能获得证据，必须承认该限制。

这是 Pi 内部的策略，而不是操作系统沙箱。外部工具上的注解是其作者的声明；其他扩展以 Pi 的权限运行代码。模式自身的写入仅限于会话快照和提案导出。

## 状态与文件

状态和最新提案作为自定义条目保存在**当前会话分支**上。在恢复、重新加载、切换会话或浏览树时会恢复。新分支仅继承其祖先中已存在的快照。

每个提案都会在项目中创建独立的 `.pi/plans/<uuid>.md` 文件，不覆盖以前的修订版。会话是事实来源；编辑导出的 Markdown 不会修改提案，也不会自动批准提案。使用 `/plan refine` 纳入更改。在本仓库中，`.pi/plans/` 已从 Git 排除。

如果导出失败，提案保留在会话中，不打开执行选择器，可用 `/plan review` 重试。`.pi` 和 `plans` 目录不能是符号链接。在受支持的系统上，文件以独占方式创建，权限为 `0600`。`--no-session` 仅在进程期间保留状态，而 Markdown 文件仍保留在磁盘上。

## TUI、RPC、print 和 JSON

TUI 使用原生对话框和模式指示器。已测试 `regular` 和 `fullscreen`、Unicode 以及窄终端缩放。

RPC 使用原生 `extension_ui_request` 请求（`select` 和 `input`）、文本组件和通知。客户端必须显示提案，并以 `extension_ui_response` 回复对话框，或取消对话框。绝不根据超时推断回复和批准。实施在规划回合结束后开始。

Print/text 和 JSON 在无对话框、无自动执行的情况下保留限制。待定问题包含在最终回复中；计划完成后会导出，模型必须在最终回复中包含其 Markdown。JSON/RPC 保持 stdout 专用于协议。

```sh
pi --plan -p 'Plan a catalog search'
pi --plan --mode json -p 'Plan a catalog search'
pi --mode rpc
```

## 开发与验证

要在不发布的情况下测试检出副本，请用 `pi install /absolute/path/to/pi-plan-claude-codex` 安装其路径；然后像使用 npm 软件包一样使用 `pi` 和 `/plan`。若仅在单次开发调用中加载，请使用 `pi -e /absolute/path/to/pi-plan-claude-codex`。

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

检查器复用 Pi 安装中的依赖。分发测试会打包本扩展，从本地 npm registry 提供 tarball，并在临时 profile 中运行 `pi install npm:pi-plan-claude-codex`。然后不带参数启动 `pi`，并在真实终端中激活 `/plan`。它们不会修改用户的个人配置，也不会下载第三方依赖。

`check` 需要 PATH 中有 `tsc`。可以指定 `PI_PLAN_HOST_ROOT`（Pi 软件包根目录）和 `PI_PLAN_TSC`（检查器可执行文件）。测试使用 Node 原生类型剥离，已用 Node `24.18.0` 验证。Unix 终端测试需要 Python 3，在 Windows 上跳过。

测试套件检查安装与自动加载、工具策略、分支快照、导出、错误与取消、两个会话中的批准、模型/推理保留、对话框失效、完善、重载、历史隔离、嵌套调用、无 UI 模式和真实终端。使用已安装的 Pi 运行时和确定性 provider，不调用模型，不使用真实凭据。Fixture 不包含在可分发软件包中。

这些测试验证机制和协议行为。它们不是与真实模型的对话评估，也不验证特定 RPC 客户端。
