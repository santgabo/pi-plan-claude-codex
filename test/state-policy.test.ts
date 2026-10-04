import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry, ToolInfo } from "@earendil-works/pi-coding-agent";
import { allowsTool, gitArguments, planningTools } from "../extensions/plan-mode/policy.ts";
import { emptyState, restoreState, STATE_TYPE } from "../extensions/plan-mode/state.ts";

function tool(name: string, readOnly?: boolean, builtin = false): ToolInfo {
  return {
    name, description: name, parameters: {}, exposure: "direct",
    annotations: readOnly === undefined ? undefined : { readOnlyHint: readOnly },
    sourceInfo: { path: builtin ? `builtin:${name}` : "fixture.ts", source: "test", scope: "temporary", origin: "top-level" },
  };
}

test("planning permits built-in reads and declared external reads, but not executors or writes", () => {
  for (const name of ["read", "grep", "find", "ls"]) assert.ok(allowsTool(tool(name, undefined, true)));
  for (const name of ["bash", "powershell", "codemode"]) assert.equal(allowsTool(tool(name, true)), false);
  assert.equal(allowsTool(tool("write")), false);
  assert.equal(allowsTool(tool("read")), false); // An override is not automatically trusted.
  assert.equal(allowsTool(undefined), false);
  assert.equal(allowsTool({ ...tool("mcp_read", true), annotations: { readOnlyHint: true, destructiveHint: true } }), false);
  assert.ok(allowsTool(tool("mcp_read", true)));
  const all = [tool("read", undefined, true), tool("write"), tool("mcp_read", true), tool("plan_submit")];
  assert.deepEqual(planningTools(all, ["write", "mcp_read"]), ["mcp_read", "read", "plan_submit"]);
});

test("Git queries put paths after -- and reject refs that could inject options", () => {
  assert.ok(gitArguments("status").includes("--no-optional-locks"));
  assert.deepEqual(gitArguments("diff", "HEAD", "--output=bad").slice(-3), ["HEAD", "--", "--output=bad"]);
  for (const ref of ["--output=bad", "HEAD; touch bad", "$(touch bad)", "HEAD..main", ""]) {
    assert.throws(() => gitArguments("show", ref));
  }
  assert.ok(gitArguments("show", "HEAD~1").includes("--no-textconv"));
});

test("restore uses only supplied branch snapshots and returns an independent copy", () => {
  const saved = { ...emptyState(), enabled: true, toolsBeforePlan: ["read", "write"] };
  const entry: SessionEntry = {
    type: "custom", id: "1", parentId: null, timestamp: "2026-10-03T00:00:00Z",
    customType: STATE_TYPE, data: saved,
  };
  const restored = restoreState([entry]);
  restored.toolsBeforePlan?.push("other");
  assert.deepEqual(saved.toolsBeforePlan, ["read", "write"]);
  assert.deepEqual(restoreState([]), emptyState());
  assert.equal(restoreState([entry, { ...entry, id: "2", data: { version: 99, enabled: false } }]).enabled, true);
});
