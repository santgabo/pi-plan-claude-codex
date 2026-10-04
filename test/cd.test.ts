import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const cd = await readFile(new URL("../.github/workflows/cd.yml", import.meta.url), "utf8");
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const repository = "santgabo/pi-plan-claude-codex";
const trusted = {
  repository, ref: "refs/heads/main",
  event: { workflow_run: { conclusion: "success", event: "push", head_branch: "main", head_repository: { full_name: repository }, head_sha: "a".repeat(40) } },
};

function allowed(github: typeof trusted): unknown {
  const match = cd.match(/^    if: >-\n([\s\S]*?)^    runs-on:/m);
  assert.ok(match, "publication must have a job-level guard before runner allocation");
  return runInNewContext(match[1].trim(), { github }, { timeout: 1000 });
}

test("CD publishes only after successful push CI on this repository's main branch", () => {
  assert.match(ci, /^name: CI$/m);
  assert.match(cd, /workflow_run:\n    workflows: \[CI\]\n    types: \[completed\]\n    branches: \[main\]/);
  assert.equal(allowed(trusted), true);
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out", "action_required", "neutral", ""]) {
    const github = structuredClone(trusted);
    github.event.workflow_run.conclusion = conclusion;
    assert.equal(allowed(github), false, conclusion);
  }
  for (const event of ["pull_request", "pull_request_target", "workflow_dispatch", "schedule"]) {
    const github = structuredClone(trusted);
    github.event.workflow_run.event = event;
    assert.equal(allowed(github), false, event);
  }
  for (const target of ["repository", "fork", "branch", "ref"]) {
    const github = structuredClone(trusted);
    if (target === "repository") github.repository = "another/repository";
    if (target === "fork") github.event.workflow_run.head_repository.full_name = "attacker/fork";
    if (target === "branch") github.event.workflow_run.head_branch = "feature";
    if (target === "ref") github.ref = "refs/heads/feature";
    assert.equal(allowed(github), false, target);
  }
});

test("CD uses the validated SHA, serializes releases, and grants OIDC only to publication", () => {
  assert.match(cd, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.doesNotMatch(cd, /ref: (main|\$\{\{ github\.(sha|ref) \}\})/);
  assert.match(cd, /concurrency:\n  group: npm-publish\n  cancel-in-progress: false/);
  assert.match(cd.split("jobs:")[0], /permissions:\n  contents: read/);
  assert.doesNotMatch(cd.split("jobs:")[0], /id-token:/);
  assert.match(cd, /    permissions:\n      contents: read\n      id-token: write/);
  assert.doesNotMatch(ci, /id-token:|npm publish/);
  assert.doesNotMatch(cd, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN|environment:|npm ci/);
  assert.match(cd, /persist-credentials: false/);
  assert.match(cd, /npm@11\.16\.0 --ignore-scripts/);
  assert.match(cd, /test "\$\(npm --version\)" = "11\.16\.0"/);
  assert.match(cd, /run: node scripts\/npm-release\.ts/);
  assert.match(cd, /if: steps\.release\.outputs\.publish == 'true'/);
  assert.match(cd, /run: npm publish --access public --tag latest --ignore-scripts/);
});
