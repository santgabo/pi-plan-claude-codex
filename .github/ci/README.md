# CI tooling

This private npm project installs the validation tools, not the extension. It is excluded from the published package and leaves the repository's root `package.json` and host `peerDependencies` unchanged.

## Reproducible installation

- Pi and its internal packages are fixed to `1.0.1`; TypeScript is fixed to `5.9.3`.
- Pi's npm manifest uses caret ranges for its internal packages. Pinning only `pi-coding-agent` would still allow newer internal versions. The `overrides` keep this graph on the tested Pi release.
- `package-lock.json` fixes the remaining dependency graph and tarball integrity hashes, including platform-specific optional dependencies needed on Linux.
- The workflow runs `npm ci --ignore-scripts --no-audit --no-fund` from this directory. It does not execute dependency lifecycle scripts or install the extension's root peers.
- The workflow adds `node_modules/.bin` to `GITHUB_PATH` and sets `PI_PLAN_HOST_ROOT` to this installation. Validation commands run from the repository root.

npm documents [root-project overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides) and the [frozen installation and lifecycle-script behavior of `npm ci`](https://docs.npmjs.com/cli/v11/commands/npm-ci).

## Local validation

With Node 24 and Python 3.12 on `PATH`, run from the repository root:

```sh
(cd .github/ci && npm ci --ignore-scripts --no-audit --no-fund)
export PATH="$PWD/.github/ci/node_modules/.bin:$PATH"
export PI_PLAN_HOST_ROOT="$PWD/.github/ci/node_modules/@earendil-works/pi-coding-agent"
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

This verifies the same tool installation and validation commands locally; it does not replace a workflow run on Ubuntu in GitHub Actions.

## Updating tools

Update the direct dependency versions and matching Pi overrides together. Regenerate the lockfile from this directory, without reusing an existing `node_modules` tree:

```sh
cd .github/ci
rm -rf node_modules
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
```

Review the lockfile's versions, registry URLs, integrity hashes, and Linux optional dependencies. Update the expected versions in `test/ci.test.ts` when changing the tested toolchain. Run `npm run check`, `npm test`, and `npm pack --dry-run --ignore-scripts` from the repository root using the new tools, and verify the workflow on GitHub Actions. Never weaken checks or replace the frozen install with a fallback that silently selects another release.
