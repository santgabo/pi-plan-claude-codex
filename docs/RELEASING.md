# Publishing releases with OIDC

CI validates the extension; CD delivers new package versions to npm. No long-lived npm publish token is stored in this repository or in GitHub Actions secrets.

## One-time npm configuration

As a maintainer, open `pi-plan-claude-codex` on npm → **Settings → Trusted publishing → Add trusted publisher → GitHub Actions**.

| Field | Exact value |
| --- | --- |
| Organization or user | `santgabo` |
| Repository | `pi-plan-claude-codex` |
| Workflow filename | `cd.yml` |
| Environment name | Leave empty |
| Allowed actions | Enable direct `npm publish` |

Enter only the filename, not `.github/workflows/cd.yml`. Dist-tag management permission is not required: publishing uses `latest`, without invoking `npm dist-tag`. If a connection was created for `ci.yml`, remove that connection and create one for `cd.yml`; npm does not allow changing a connection's identifying fields. Do not change unrelated account or package security settings.

The workflow must exist in `.github/workflows/` on the default branch (`main`). Configure npm before the release push. Committing a workflow does not create or validate npm's trust relationship. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required for publication.

## How CI gates CD

1. `.github/workflows/ci.yml` (`CI`) validates pull requests, pushes to `main`, and manual runs. It checks types, runs all offline tests, and inspects the distribution contents.
2. `.github/workflows/cd.yml` (`CD`) receives completed `workflow_run` events for `CI` on `main`.
3. The publication job additionally requires its own ref to be `refs/heads/main`, a successful **push** run on `main`, this exact repository, and the original repository as the run's head repository. PRs, forks, manual runs, cancellations, and failures cannot publish.
4. CD checks out `github.event.workflow_run.head_sha`. It does not publish a newer, untested tip of `main`, consume PR artifacts, or restore dependency caches from untrusted runs.
5. CD runs on GitHub-hosted Ubuntu with Node `24.x` and npm `11.16.0`. Only the publication job receives `id-token: write`; repository content access stays read-only.
6. `scripts/npm-release.ts` looks up the exact manifest version using npm's JSON output against `https://registry.npmjs.org/`. An existing version is skipped. Only an `E404` explicitly naming the missing requested version permits publication. Authentication, network, timeout, server, and malformed-response errors fail closed.
7. CD executes `npm publish --access public --tag latest --ignore-scripts`. No build or dependency installation is needed for this TypeScript extension. Releases are serialized, without cancelling an active publication. GitHub concurrency can replace a pending run; it is not a durable queue of every release request.

npm automatically generates provenance for OIDC publication from this public GitHub repository. OIDC works independently of a maintainer's local npm login; `npm whoami` is not a test of Trusted Publishing permissions.

## Preparing a release

1. Start from an up-to-date branch and verify the registry's versions and dist-tags:
   ```sh
   git fetch origin
   npm view pi-plan-claude-codex versions dist-tags --json
   ```
2. Choose a new semantic version. Never reuse a published version. Update `package.json`, the version references in `README.md` and `docs/README.*.md`, and [CHANGELOG.md](CHANGELOG.md). Do not change host `peerDependencies` just to publish.
3. Run the repository's checks:
   ```sh
   npm run check
   npm test
   npm pack --dry-run --ignore-scripts
   ```
   Optionally run `actionlint .github/workflows/ci.yml .github/workflows/cd.yml` when available. The suite checks release conditions and lookup errors offline; it does not publish to npm.
4. Review the packed files and commit the release. Keep generated archives, credentials, fixtures, and development tooling out of the distribution. Confirm the npm publisher configuration before integrating into `main`.
5. Integrate without rewriting remote history, tag the same release commit as `v<version>`, and push `main` and that tag. Do not bypass branch protections. The **main push**, not the tag, triggers CI and subsequent CD. Tags identify releases; versions are not bumped automatically on every push.
6. Verify both workflow runs and the actual registry state:
   ```sh
   gh run list --workflow ci.yml --branch main
   gh run list --workflow cd.yml --branch main
   npm view pi-plan-claude-codex version dist-tags --json
   ```
   A successful push or dry-run is not proof of publication. Match the run's validated SHA and the published version before announcing success.

## Recovery

If CD fails, inspect its logs before retrying. Correct mismatched publisher fields in npm, missing direct-publish permission, or genuine registry errors; do not introduce a stored write token as a silent fallback. Re-run the successful **push** CI execution to trigger CD again for the same validated SHA. Running CI via `workflow_dispatch` cannot publish. If the version already exists, a subsequent lookup skips it rather than attempting to overwrite it.

## Official references

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/): npm >= 11.5.1, Node >= 22.14.0, supported hosted runners, publisher fields, direct-publish permission, and OIDC authentication.
- [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run): default-branch requirement, conclusion and branch filters, and privileged-workflow risks.
- [GitHub workflow_run payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_run): upstream workflow context used to select the tested commit.
- [actions/checkout](https://github.com/actions/checkout): checkout of a specific ref or SHA and credential-persistence configuration.
