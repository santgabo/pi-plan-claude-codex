import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveProposal } from "../extensions/plan-mode/storage.ts";

test("exports independent revisions and propagates cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-plan-storage-"));
  try {
    const [first, second] = await Promise.all([saveProposal(root, "# Primero"), saveProposal(root, "# Segundo")]);
    assert.notEqual(first, second);
    assert.equal(await readFile(first, "utf8"), "# Primero\n");
    assert.equal((await readdir(join(root, ".pi/plans"))).length, 2);
    await assert.rejects(saveProposal(root, "# Cancelado", AbortSignal.abort()), { name: "AbortError" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("refuses exports through a symlink outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-plan-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "pi-plan-outside-"));
  try {
    await symlink(outside, join(root, ".pi"));
    await assert.rejects(saveProposal(root, "# Plan"), /simbólico/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
