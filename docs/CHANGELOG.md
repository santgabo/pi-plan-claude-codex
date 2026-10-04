# Changelog

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
