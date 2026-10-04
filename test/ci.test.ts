import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PI_PACKAGES = [
  "chord", "pi-agent-core", "pi-ai", "pi-codemode", "pi-coding-agent", "pi-mcp", "pi-telemetry", "pi-tui",
].map((name) => `@earendil-works/${name}`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function manifest(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  assert.ok(isRecord(value));
  return value;
}

test("CI locks the complete Pi release in a private project without changing extension peers", async () => {
  const tools = await manifest("../.github/ci/package.json");
  const lock = await manifest("../.github/ci/package-lock.json");
  const extension = await manifest("../package.json");
  assert.equal(tools.private, true);
  assert.equal(tools.scripts, undefined);
  assert.deepEqual(tools.dependencies, { "@earendil-works/pi-coding-agent": "1.0.1", typescript: "5.9.3" });
  assert.ok(isRecord(tools.overrides));
  assert.deepEqual(tools.overrides, Object.fromEntries(PI_PACKAGES.filter((name) => name !== "@earendil-works/pi-coding-agent").map((name) => [name, "1.0.1"])));
  assert.equal(lock.lockfileVersion, 3);
  assert.ok(isRecord(lock.packages));
  const root = lock.packages[""];
  assert.ok(isRecord(root));
  assert.deepEqual(root.dependencies, tools.dependencies);
  for (const name of PI_PACKAGES) {
    const dependency: unknown = lock.packages[`node_modules/${name}`];
    assert.ok(isRecord(dependency), name);
    assert.equal(dependency.version, "1.0.1", name);
  }
  for (const [path, dependency] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.ok(isRecord(dependency), path);
    assert.match(path, /^node_modules\//);
    assert.equal(typeof dependency.resolved, "string", path);
    assert.equal(typeof dependency.integrity, "string", path);
    if (typeof dependency.resolved === "string") assert.match(dependency.resolved, /^https:\/\/registry\.npmjs\.org\//);
    if (typeof dependency.integrity === "string") assert.match(dependency.integrity, /^sha512-/);
    if (path.includes("node_modules/@earendil-works/")) assert.equal(dependency.version, "1.0.1", path);
  }
  assert.ok(isRecord(extension.peerDependencies));
  for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
    assert.equal(typeof extension.peerDependencies[name], "string", name);
    if (isRecord(extension.dependencies)) assert.equal(extension.dependencies[name], undefined, name);
  }
});

test("CI lock retains the Linux x64 esbuild binary for installation without lifecycle scripts", async () => {
  const lock = await manifest("../.github/ci/package-lock.json");
  assert.ok(isRecord(lock.packages));
  const esbuild = lock.packages["node_modules/esbuild"];
  const binary = lock.packages["node_modules/@esbuild/linux-x64"];
  assert.ok(isRecord(esbuild) && isRecord(binary));
  assert.equal(binary.version, esbuild.version);
  assert.equal(binary.optional, true);
  assert.deepEqual(binary.os, ["linux"]);
  assert.deepEqual(binary.cpu, ["x64"]);
});
