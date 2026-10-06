# Plan mode for Pi

> 🌐 Available in: [Español](docs/README.es.md) | [Français](docs/README.fr.md) | [Português](docs/README.pt.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md).

A TypeScript extension that adds conversational planning to Pi-agent v1 or later: explore a project, clarify decisions, suggest useful improvements, and present a plan before implementation. Package: `pi-plan-claude-codex`, version `0.1.1`.

The workflow draws on [Codex planning](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) and [Claude Code plan review and approval](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan). The implementation targets the public extension APIs of Pi-agent v1 or later; later major releases may require a compatibility review.

## Install and use

Install the package once:

```sh
pi install npm:pi-plan-claude-codex
```

Then launch Pi as usual, from any project:

```sh
pi
```

Activate the mode in the conversation:

```text
/plan
```

In the TUI, the fixed **Ctrl+Alt+P** shortcut (**Ctrl+Option+P** on macOS) also toggles the mode, just like `/plan` without arguments. It preserves the editor draft and current proposal, sends no model request, and **never approves or executes a plan**. Disabling restores the previous tools. During an active turn, it only shows a warning: it neither interrupts the work nor schedules a later toggle.

On macOS, configure your terminal to send Option as Alt/Meta if needed. Native Pi dialogs retain keyboard focus; this is not a global shortcut. If your terminal, operating system, or another shortcut intercepts the combination, use `/plan` instead.

Now describe your goal in a regular message, for example: “I want to add catalog search; investigate how it works and suggest improvements before deciding.”

Installation registers the package in Pi's personal configuration. It loads automatically on subsequent launches, making `/plan` available. Activate the mode with that command or the keyboard shortcut; no paths or flags are needed at startup. `/plan <request>` is also supported as a shortcut.

To install a local checkout, including before the first npm release, run:

```sh
pi install /absolute/path/to/pi-plan-claude-codex
```

Then use the same `pi` → `/plan` workflow.

Requires Pi-agent v1 or later and Node.js `>=22.19.0`. Pi loads TypeScript directly without a prior compilation step and provides the dependencies declared in `peerDependencies`.

## Workflow

1. **Investigate.** Read project instructions and explore the implementation. First look for facts the agent can discover on its own.
2. **Discuss.** Clarify the goal, scope, constraints, and success criteria. Suggest useful UX, simplicity, or behavioral improvements, explain their tradeoffs, and ask whether to include them.
3. **Resolve decisions.** Settle interfaces, approach, errors, compatibility, and validation. The interview adapts to the task: typically one decision per question, up to three related questions, with no minimum number of rounds or filler questions.
4. **Review.** Present a complete Markdown plan with accepted decisions, verifiable steps, tests, and assumptions. The user chooses what to do.

Questions can offer options with tradeoffs and a recommendation, as well as a free-form answer. Cancelling leaves the decision unanswered and stops the turn. The model is instructed to preserve prior decisions and not expand scope without approval. Interview quality and plan completeness also depend on the selected model.

When the plan is presented, these actions are available:

- **Continue planning:** keep the pending proposal and read-only restrictions.
- **Refine the plan:** request feedback and generate a new revision.
- **Execute in this conversation:** restore the previous tools and begin implementation using the approved plan.
- **Execute in a clean session:** create a session without the interview history and pass along the full plan, its provenance, the model, reasoning level, and the previous tools.

Cancelling review keeps the mode active. Approval applies only to that proposal and session. New information invalidates the previous proposal; a late response to an invalidated dialog cannot start execution. If creating a clean session is cancelled, planning resumes.

There is no limit on refinement rounds. Continue with ordinary messages or the refinement action; each completed revision must go through `plan_submit` and review again. The normal approval path does not require toggling `/plan` off. In TUI and RPC, if the model ends a turn without a current proposal, the extension requests one recovery continuation: ask unresolved decisions with `plan_ask` or submit the full updated plan with `plan_submit`. Recovery does not run after an unanswered/cancelled question, dismissed review, failed export, aborted turn, or error. If the model still ignores the workflow, a warning keeps planning active and invites another ordinary message instead of automatically looping or approving anything.

## Commands

| Command | Result |
| --- | --- |
| `/plan` | Toggle plan mode. |
| Ctrl+Alt+P (macOS: Ctrl+Option+P) | Same toggle as `/plan`, in the TUI. |
| `/plan <request>` | Enable the mode and start planning that request. |
| `/plan on` | Enable without sending a request to the model. |
| `/plan off` | Disable the mode and restore the previous tools. |
| `/plan status` | Show the mode, revision, status, and Markdown file. |
| `/plan review` | Show the proposal and selector again; retry a failed export. |
| `/plan execute` | Open the same review selector; an action must be chosen. |
| `/plan refine [comments]` | Refine the proposal with comments or open a prompt to enter them. |
| `--plan` | Start in plan mode if the branch has no saved state. |

Mode changes happen while the agent is idle. Writing “implement the plan” as an ordinary message keeps the agent in planning mode: transition through the commands or the explicit execution choice. `/plan off` ends the mode's restrictions without automatically starting implementation.

## Allowed exploration

While active, `read`, `grep`, `find`, `ls`, and three built-in tools are enabled:

| Tool | Purpose |
| --- | --- |
| `plan_ask` | Ask questions with options or a free-form answer. |
| `plan_submit` | Save and present a proposal; does not approve execution. |
| `plan_inspect` | Fixed Git queries: `status`, `diff`, `log`, and `show`. |

Previously active external tools may remain available if they declare `readOnlyHint: true` and do not declare `destructiveHint: true`. Unknown or mutating tools are blocked, including nested calls, as are `bash`, `powershell`, `codemode`, `write`, `edit`, and the user's `!`/`!!` commands.

`plan_inspect` uses direct arguments, no shell, fixed operations, validated refs, options that disable external diff and textconv, a ten-second timeout, and bounded output. Tests, builds, scripts, and installations must wait for approved execution. If the plan requires evidence that depends on those operations, it must acknowledge that limitation.

This is a policy within Pi, not an operating-system sandbox. Annotations on external tools are declarations made by their authors; other extensions run code with Pi's permissions. The mode's own writes are limited to session snapshots and proposal exports.

## State and files

State and the latest proposal are saved as custom entries on the **current session branch**. They are restored when resuming, reloading, switching sessions, or navigating the tree. A new branch inherits only snapshots present in its ancestors.

Each proposal creates a separate `.pi/plans/<uuid>.md` file in the project without overwriting previous revisions. The session is the source of truth; editing the exported Markdown does not modify or automatically approve the proposal. Use `/plan refine` to incorporate changes. `.pi/plans/` is excluded from Git in this repository.

If export fails, the proposal remains in the session, the execution selector is not opened, and `/plan review` can retry. The `.pi` and `plans` directories cannot be symbolic links. Files are created exclusively with `0600` permissions on supported systems. `--no-session` keeps state only for the process, while Markdown files remain on disk.

## TUI, RPC, print, and JSON

The TUI uses native dialogs and a mode indicator. `regular` and `fullscreen`, Unicode, and resizing to a narrow terminal have been tested.

RPC uses native `extension_ui_request` requests (`select` and `input`), text widgets, and notifications. The client must display the proposal and respond to dialogs with `extension_ui_response`, or cancel them. Responses and approvals are never inferred from a timeout. Implementation starts after the planning turn has ended.

Print/text and JSON preserve the restrictions without dialogs or automatic execution. Pending questions are included in the final response; when the plan is complete, it is exported and the model must include its Markdown in the final response. JSON/RPC keep stdout reserved for the protocol.

```sh
pi --plan -p 'Plan a catalog search'
pi --plan --mode json -p 'Plan a catalog search'
pi --mode rpc
```

## Development and verification

To test the checkout without publishing it, install its path with `pi install /absolute/path/to/pi-plan-claude-codex`; then use `pi` and `/plan` just as with the npm package. To load it for a single development invocation, use `pi -e /absolute/path/to/pi-plan-claude-codex`.

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

The checker reuses dependencies from the Pi installation. Distribution tests package the extension, serve the tarball from a local npm registry, and run `pi install npm:pi-plan-claude-codex` in a temporary profile. They then start `pi` without arguments and activate `/plan` in a real terminal. They do not modify the user's personal configuration or download third-party dependencies.

`check` requires `tsc` on PATH. You can specify `PI_PLAN_HOST_ROOT` (the Pi package root) and `PI_PLAN_TSC` (the checker executable). Tests use Node's native type stripping and were verified with Node `24.18.0`. Unix terminal tests require Python 3 and are skipped on Windows.

The suite checks installation and automatic loading, tool policy, branch snapshots, exports, errors and cancellation, approval in both sessions, model/reasoning preservation, dialog invalidation, refinement, reload, history isolation, nested calls, non-UI modes, and a real terminal. It uses the installed Pi runtime with a deterministic provider and no model calls or real credentials. Fixtures are not included in the distributable package.

These tests verify mechanisms and protocol behavior. They are not a conversational evaluation with a real model or validation of specific RPC clients.

### Continuous integration

GitHub Actions runs `npm run check`, the complete `npm test` suite, and `npm pack --dry-run --ignore-scripts` for pull requests, pushes to `main`, and manual runs. The job uses Ubuntu 24.04, Node `24.x`, and Python `3.12`, including both terminal modes and package-installation tests.

Pi `1.0.1`, its internal packages, and TypeScript `5.9.3` are installed from a separate private [CI tooling project](.github/ci/README.md) with a committed lockfile. The workflow uses `npm ci --ignore-scripts` there, not an installation of the root package, so host `peerDependencies` remain unchanged. Dependency installation needs npm registry access; the tests use deterministic offline fixtures and a local test registry. No model credentials are used during validation.

### Continuous delivery

`.github/workflows/cd.yml` publishes to npm through OIDC only after `CI` succeeds for a push to `main` in this repository. It checks out the exact SHA validated by CI, serializes publication without cancelling an active release, and skips versions already published. Registry errors fail the job instead of being interpreted as a missing version. PRs, forks, manual CI runs, and failed CI runs cannot publish.

Maintainers must configure the npm Trusted Publisher with user `santgabo`, repository `pi-plan-claude-codex`, workflow filename **`cd.yml`**, no environment, and direct `npm publish` enabled. No npm publish token is stored in GitHub. Versions are bumped deliberately, not on every push. See the [release guide](docs/RELEASING.md) and [changelog](docs/CHANGELOG.md) for configuration, validation, and release verification.
