import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const wsl = process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);

for (const mode of ["regular", "fullscreen"]) {
  for (const scenario of ["plan", "question", "recovery", "shortcut", "shortcut-plan"]) {
    test(`actual ${mode} TUI: ${scenario}, Unicode, and native dialogs`, {
      skip: process.platform === "win32" ? "Unix PTY requires Python and fcntl" : scenario.startsWith("shortcut") && wsl ? "Pi reserves Ctrl+Q for follow-up on WSL" : false,
    }, async () => {
      const root = await mkdtemp(join(tmpdir(), "pi-plan-tui-"));
      try {
        const output = execFileSync("python3", [resolve("test/fixtures/terminal.py"), root, resolve("."), mode, scenario], { encoding: "utf8", timeout: 25000 });
        assert.match(output, /: OK/);
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
}
