# Changelog

## 0.1.3

### Fixed

- Replace the plan-mode shortcut with Ctrl+Q on macOS/Linux, removing Ctrl+Alt+P rather than retaining it as an alias. No Option/Meta terminal configuration is required. Windows/WSL keeps Pi's reserved Ctrl+Q follow-up action; use `/plan` there.
- Verify shortcut registration against the installed host's actual default keybindings and reserved-key conflicts. Exercise Ctrl+Q and the removed shortcut in both TUI modes, including through the installed npm package in disposable offline profiles.

## 0.1.2 — 2026-10-06

Summary of merged [PR #3](https://github.com/santgabo/pi-plan-claude-codex/pull/3) and [PR #4](https://github.com/santgabo/pi-plan-claude-codex/pull/4).

### Added

- Toggle plan mode in the TUI with the fixed Ctrl+Alt+P shortcut (Ctrl+Option+P on macOS), preserving the editor draft and proposal. Busy turns only show a warning; toggling never approves or executes a plan. `/plan` remains available.
- Add deterministic shortcut state and terminal tests, planning prompt-contract tests, and RPC coverage for instruction removal after approval and recovery exclusions after cancellation, errors, aborts, or failed exports.

### Changed

- Use Pi 1.0.4 as the tested reference and pin CI tooling to that version, keeping TypeScript at 5.9.3 and host peer dependency ranges unchanged.
- Focus planning instructions on consequential decisions: investigate only as needed, preserve accepted choices, avoid filler questions or forced improvements, and submit directly when the request is sufficiently defined.
- Clarify presentation after submission: TUI/RPC waits for review without repeating the full plan in chat; text/JSON includes the complete plan in the final response. Read-only restrictions and explicit execution approval remain unchanged.
- Update compatibility and workflow documentation, record local validation limits, and explain that RPC clients must explicitly cancel open review dialogs.

## 0.1.1 — 2026-10-04

### Fixed

- Recover interactive planning when a model ends a turn without a current proposal: request one bounded continuation to ask unresolved questions or submit the updated plan for review.
- Keep repeated refinement rounds in planning until explicit execution approval, without directing users to disable `/plan` as the normal implementation path. Preserve cancellation and stale-approval protections.

### Changed

- Separate CI validation from CD publication. New versions on `main` are delivered through npm Trusted Publishing only after the exact source commit passes CI.
- Publish without stored npm write tokens; skip existing versions and fail closed on registry lookup errors.

## 0.1.0

### Added

- Conversational planning with project exploration, decision questions, Markdown proposals, refinement, and explicit execution approval in the current conversation or a clean session.
- Read-only tool policy, branch-aware persistence, proposal exports, and support for TUI, RPC, text, and JSON modes.
- Deterministic offline tests, locked CI tooling, and translated README documentation.
