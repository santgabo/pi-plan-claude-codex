import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

for (const mode of ["regular", "fullscreen"]) {
  for (const scenario of ["plan", "question"]) {
    test(`actual ${mode} TUI: ${scenario}, Unicode, and native dialogs`, { skip: process.platform === "win32" }, async () => {
      const root = await mkdtemp(join(tmpdir(), "pi-plan-tui-"));
      try {
        const output = execFileSync("python3", [resolve("test/fixtures/terminal.py"), root, resolve("."), mode, scenario], { encoding: "utf8", timeout: 25000 });
        assert.match(output, /: OK/);
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
}
