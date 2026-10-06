import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const wsl = process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

for (const mode of ["regular", "fullscreen"]) {
  for (const scenario of ["plan", "shortcut"]) {
    test(`npm installation → plain pi → ${scenario === "plan" ? "/plan" : "Ctrl+Q"} (${mode})`, {
      skip: process.platform === "win32" ? "Unix PTY requires Python and fcntl" : scenario === "shortcut" && wsl ? "Pi reserves Ctrl+Q for follow-up on WSL" : false,
    }, async () => {
      const root = await mkdtemp(join(tmpdir(), "pi-plan-install-"));
      const source = resolve(".");
      const registry = createServer();
      try {
        const manifest: unknown = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
        assert.ok(isRecord(manifest) && typeof manifest.name === "string" && typeof manifest.version === "string");
        const { name, version } = manifest;
        const packed: unknown = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root], { cwd: source, encoding: "utf8", timeout: 10000 }));
        assert.ok(Array.isArray(packed) && isRecord(packed[0]) && typeof packed[0].filename === "string");
        const archive = await readFile(join(root, packed[0].filename));
        const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
        const requested: string[] = [];
        await new Promise<void>((done) => registry.listen(0, "127.0.0.1", done));
        const address = registry.address();
        assert.ok(address && typeof address !== "string");
        const url = `http://127.0.0.1:${address.port}`;
        const tarball = `/${name}/-/${name}-${version}.tgz`;
        // Only this package is available. No public registry or third-party install is needed.
        registry.on("request", (request, response) => {
          requested.push(request.url ?? "");
          if (request.url === `/${name}`) {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ name, "dist-tags": { latest: version }, versions: { [version]: { ...manifest, dist: { tarball: `${url}${tarball}`, integrity } } } }));
          } else if (request.url === tarball) response.end(archive);
          else { response.statusCode = 404; response.end("Only the test package is available"); }
        });
        const userConfig = join(root, "npmrc");
        await writeFile(userConfig, "");
        const env = {
          ...process.env, PI_CODING_AGENT_DIR: join(root, "agent"), PI_OFFLINE: "1",
          npm_config_registry: url, npm_config_cache: join(root, "cache"),
          npm_config_userconfig: userConfig, npm_config_ignore_scripts: "true",
          npm_config_audit: "false", npm_config_fund: "false",
        };
        await run("pi", ["install", `npm:${name}`], { cwd: root, env, timeout: 20000 });
        assert.ok(requested.includes(`/${name}`) && requested.includes(tarball));
        const settingsFile = join(root, "agent/settings.json");
        const settings: unknown = JSON.parse(await readFile(settingsFile, "utf8"));
        assert.ok(isRecord(settings) && Array.isArray(settings.packages));
        assert.ok(settings.packages.includes(`npm:${name}`));
        // The provider is test scaffolding. The plan extension is loaded only from the installed package.
        await writeFile(settingsFile, JSON.stringify({
          ...settings, defaultProvider: "plan-fixture", defaultModel: "local", tuiMode: mode,
          extensions: [join(source, "test/fixtures/provider.ts")],
        }));
        const result = await run("python3", [join(source, "test/fixtures/terminal.py"), root, source, mode, scenario, "installed"], { env, encoding: "utf8", timeout: 25000 });
        assert.match(result.stdout, /: OK/);
        if (scenario === "plan") assert.equal(await readFile(join(root, "implementation.txt"), "utf8"), "APPROVED\n");
        else await assert.rejects(readFile(join(root, "implementation.txt")), { code: "ENOENT" });
      } finally {
        await new Promise<void>((done) => registry.close(() => done()));
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}
