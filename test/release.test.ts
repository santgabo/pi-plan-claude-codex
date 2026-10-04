import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { publicationRequired } from "../scripts/npm-release.ts";

const version = "0.1.1";
const missing = JSON.stringify({ error: { code: "E404", summary: `No match found for version ${version}` } });

test("npm release lookup skips existing versions and accepts only an explicitly missing version", () => {
  assert.equal(publicationRequired(0, JSON.stringify(version), version), false);
  assert.equal(publicationRequired(1, missing, version), true);
  assert.throws(() => publicationRequired(0, JSON.stringify("0.1.0"), version));
  assert.throws(() => publicationRequired(0, missing, version));
  assert.throws(() => publicationRequired(1, missing, "0.1.2"));
});

test("registry authentication, network, server and malformed responses never permit publication", () => {
  for (const code of ["E401", "E403", "E500", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]) {
    assert.throws(() => publicationRequired(1, JSON.stringify({ error: { code } }), version), new RegExp(code));
  }
  assert.throws(() => publicationRequired(1, JSON.stringify({ error: { code: "E404", summary: "Package inaccessible" } }), version));
  assert.throws(() => publicationRequired(null, "", version));
  for (const output of ["", "not JSON", "null", "{}", "[]"]) assert.throws(() => publicationRequired(1, output, version));
});

test("release CLI reports its decision through GitHub outputs without contacting npm", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-plan-release-"));
  try {
    const manifest: unknown = JSON.parse(await readFile(resolve("package.json"), "utf8"));
    assert.ok(typeof manifest === "object" && manifest !== null && "version" in manifest && typeof manifest.version === "string");
    for (const exists of [true, false]) {
      const output = join(root, `outputs-${exists}`);
      const response = exists ? JSON.stringify(manifest.version) : JSON.stringify({ error: { code: "E404", summary: `No match found for version ${manifest.version}` } });
      await writeFile(join(root, "response.json"), response);
      await writeFile(join(root, "npm"), `#!/bin/sh\ncat "$FIXTURE_ROOT/response.json"\nexit ${exists ? 0 : 1}\n`, { mode: 0o700 });
      const stdout = execFileSync(process.execPath, [resolve("scripts/npm-release.ts")], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}`, FIXTURE_ROOT: root, GITHUB_OUTPUT: output }, encoding: "utf8",
      });
      assert.match(stdout, exists ? /already published; skipping/ : /publication required/);
      assert.equal(await readFile(output, "utf8"), `publish=${!exists}\n`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
