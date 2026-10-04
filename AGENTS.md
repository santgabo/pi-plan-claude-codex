# Repository Guidelines

## Project Structure & Module Organization

- `extensions/plan-mode/index.ts` registers commands, tools, UI, and lifecycle hooks. Keep policy, prompts, branch state, and Markdown exports in `policy.ts`, `prompt.ts`, `state.ts`, and `storage.ts`.
- `test/*.test.ts` contains behavioral tests; `test/fixtures/` supplies the offline provider and Python terminal driver.
- `scripts/` resolves installed Pi dependencies and runs type checks. `README.md` documents usage. Generated `.pi/plans/` files are ignored.

## Build, Test, and Development Commands

Run commands from the repository root. Use installed Pi 1.0.1, `tsc`, and Node 24 for the tested development environment; Unix terminal tests require Python 3.

- `npm run check`: strict TypeScript validation against installed Pi declarations.
- `npm test`: run all Node tests, including RPC, packaging, and terminal integration.
- `node --import ./scripts/register-host.mjs --test test/rpc.test.ts`: run one suite.
- `npm pack --dry-run --ignore-scripts`: inspect distribution contents.
- `pi install "$PWD"`, then `pi` and `/plan`: test local installation and normal activation.

Pi loads TypeScript directly; no build step is configured. Set `PI_PLAN_HOST_ROOT` or `PI_PLAN_TSC` when automatic discovery fails.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons, ESM imports, and explicit `.ts` extensions. Use camelCase for functions and variables, PascalCase for types, and uppercase constants. Keep TypeScript syntax erasable; avoid `any`, enums, and compatibility-hiding casts. No formatter or lint command is configured; match existing files.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name files `*.test.ts` and describe observable behavior. No numeric coverage threshold is configured. Cover cancellation, stale approvals, branch restoration, and affected execution modes. Use temporary directories, isolated Pi profiles, and deterministic providers; never test with real credentials or paid models. Keep fixtures outside extension discovery.

## Commit & Pull Request Guidelines

History includes `feat: add conversational plan mode extension`. Continue with focused `<type>: <summary>` commits. PR descriptions should explain behavior, scope, relevant validation, and limitations. Link applicable issues; include terminal output or screenshots for UI changes.

## Configuration & Agent Instructions

Write all newly generated documentation in English unless the user explicitly requests another language. Keep `docs/README.es.md` as the explicitly requested Spanish localization of `README.md`. Translations live under `docs/` (`docs/README.<lang>.md`) with `README.md` as source; keep the language switcher links in sync.

Verify public APIs against the target Pi installation before changes. Keep host packages in `peerDependencies`, preserve explicit execution approval, and keep stdout clean in JSON/RPC. Interpret “Jeff” as “Jev” in user requests.
