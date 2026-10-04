import { spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function publicationRequired(status: number | null, stdout: string, version: string): boolean {
  if (status === null) throw new Error("npm version lookup did not finish successfully.");
  const result: unknown = JSON.parse(stdout);
  if (status === 0) {
    if (result !== version) throw new Error("npm returned an unexpected version; refusing to publish.");
    return false;
  }
  // E404 alone can also mean access failure. Only a missing public version is a release candidate.
  if (isRecord(result) && isRecord(result.error)) {
    if (result.error.code === "E404" && result.error.summary === `No match found for version ${version}`) return true;
    throw new Error(`npm version lookup failed: ${String(result.error.code)}.`);
  }
  throw new Error(`npm version lookup failed with exit status ${status}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest: unknown = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (!isRecord(manifest) || manifest.name !== "pi-plan-claude-codex" || typeof manifest.version !== "string") {
    throw new Error("Unexpected release manifest.");
  }
  const result = spawnSync("npm", [
    "view", `${manifest.name}@${manifest.version}`, "version", "--json", "--registry=https://registry.npmjs.org/",
  ], { encoding: "utf8", timeout: 30000 });
  if (result.error) throw result.error;
  const publish = publicationRequired(result.status, result.stdout, manifest.version);
  console.log(`${manifest.name}@${manifest.version}: ${publish ? "new version; publication required" : "already published; skipping"}.`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
}
