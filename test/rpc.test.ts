import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { RpcCommand, RpcExtensionUIResponse } from "@earendil-works/pi-coding-agent";
import { isState } from "../extensions/plan-mode/state.ts";

interface RecordMessage {
  type: string;
  id?: string;
  method?: string;
  title?: string;
  options?: string[];
  success?: boolean;
  data?: unknown;
}

function isRecord(value: unknown): value is RecordMessage {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function data(record: RecordMessage): Record<string, unknown> {
  assert.ok(isObject(record.data));
  return record.data;
}

function snapshot(record: RecordMessage) {
  const entries = data(record).entries;
  assert.ok(Array.isArray(entries));
  const last = [...entries].reverse().find((entry: unknown) => isObject(entry) && entry.customType === "pi-plan-claude-codex.state");
  assert.ok(isObject(last) && isState(last.data));
  return last.data;
}

class Client {
  readonly records: RecordMessage[] = [];
  readonly process: ChildProcessWithoutNullStreams;
  readonly root: string;
  stderr = "";
  private buffer = "";
  private listeners = new Set<() => void>();

  constructor(root: string, scenario: string, persistent = false) {
    this.root = root;
    this.process = spawn("pi", [
      "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve",
      ...(persistent ? ["--session-dir", join(root, "sessions")] : ["--no-session"]),
      "--extension", resolve("extensions/plan-mode/index.ts"), "--extension", resolve("test/fixtures/provider.ts"),
      "--provider", "plan-fixture", "--model", "local", "--plan", "--mode", "rpc",
    ], { cwd: root, env: { ...process.env, PI_CODING_AGENT_DIR: join(root, "agent"), PI_PLAN_SCENARIO: scenario }, stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        const record: unknown = JSON.parse(line);
        assert.ok(isRecord(record), "stdout must contain only RPC records");
        this.records.push(record);
      }
      for (const listener of this.listeners) listener();
    });
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk: string) => { this.stderr += chunk; });
  }

  send(command: RpcCommand | RpcExtensionUIResponse): void {
    this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  wait(predicate: (record: RecordMessage) => boolean, from = 0): Promise<RecordMessage> {
    return new Promise((resolveRecord, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`RPC timeout: ${this.stderr}\n${JSON.stringify(this.records.slice(-8))}`));
      }, 15000);
      const onExit = () => { cleanup(); reject(new Error(`Pi exited: ${this.stderr}`)); };
      const check = () => {
        const record = this.records.slice(from).find(predicate);
        if (record) { cleanup(); resolveRecord(record); }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.listeners.delete(check);
        this.process.off("exit", onExit);
      };
      this.listeners.add(check);
      this.process.once("exit", onExit);
      check();
    });
  }

  async response(command: RpcCommand): Promise<RecordMessage> {
    const id = crypto.randomUUID();
    this.send({ ...command, id });
    const record = await this.wait((item) => item.type === "response" && item.id === id);
    assert.equal(record.success, true, JSON.stringify(record));
    return record;
  }

  answer(record: RecordMessage, value?: string): void {
    assert.ok(record.id);
    this.send(value === undefined ? { type: "extension_ui_response", id: record.id, cancelled: true } : { type: "extension_ui_response", id: record.id, value });
  }

  async close(): Promise<void> {
    if (this.process.exitCode !== null) return;
    this.process.stdin.end();
    await new Promise<void>((done) => {
      const timer = setTimeout(() => this.process.kill("SIGKILL"), 3000);
      this.process.once("exit", () => { clearTimeout(timer); done(); });
    });
  }
}

async function fixture(scenario: string, action: (client: Client) => Promise<void>, persistent = false): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-plan-rpc-"));
  const client = new Client(root, scenario, persistent);
  try {
    await client.response({ type: "get_state" });
    await action(client);
    assert.doesNotMatch(client.stderr, /Extension error|stale|Unhandled/i);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("RPC presents a saved plan and cancellation preserves read-only mode", async () => {
  await fixture("plan", async (client) => {
    await client.response({ type: "prompt", message: "Plan the work" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    assert.ok(dialog.options?.includes("Execute in a clean session"));
    await assert.rejects(readFile(join(client.root, "implementation.txt")));
    client.answer(dialog);
    await client.wait((record) => record.type === "agent_settled");
    const plans = await readdir(join(client.root, ".pi/plans"));
    assert.equal(plans.length, 1);
    assert.match(await readFile(join(client.root, ".pi/plans", plans[0]), "utf8"), /## Decisions/);
    const blocked = await client.response({ type: "bash", command: "touch unauthorized.txt" });
    assert.match(JSON.stringify(blocked.data), /blocks/);
    await assert.rejects(readFile(join(client.root, "unauthorized.txt")));
  });
});

for (const fresh of [false, true]) {
  test(`RPC approval executes only after the turn settles (${fresh ? "fresh session" : "same conversation"})`, async () => {
    await fixture("plan", async (client) => {
      await client.response({ type: "set_model", provider: "plan-fixture", modelId: "alternate" });
      await client.response({ type: "set_thinking_level", level: "high" });
      const original = await client.response({ type: "get_state" });
      await client.response({ type: "prompt", message: "Plan the work" });
      const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
      const beforeApproval = client.records.length;
      client.answer(dialog, fresh ? "Execute in a clean session" : "Execute in this conversation");
      await client.wait((record) => record.type === "message_end" && JSON.stringify(record).includes("IMPLEMENTED"), beforeApproval);
      await client.wait((record) => record.type === "agent_settled", beforeApproval);
      assert.equal(await readFile(join(client.root, "implementation.txt"), "utf8"), "APPROVED\n");
      const afterApproval = client.records.slice(beforeApproval);
      const settled = afterApproval.findIndex((record) => record.type === "agent_settled");
      const write = afterApproval.findIndex((record) => record.type === "tool_execution_start" && JSON.stringify(record).includes('"toolName":"write"'));
      assert.ok(settled >= 0 && write > settled, "implementation must start after planning settles");
      const current = await client.response({ type: "get_state" });
      const currentData = data(current);
      assert.ok(isObject(currentData.model));
      assert.equal(currentData.model.id, "alternate");
      assert.equal(currentData.thinkingLevel, "high");
      assert.equal(currentData.sessionId === data(original).sessionId, !fresh);
      const entries = await client.response({ type: "get_entries" });
      assert.equal(snapshot(entries).enabled, false);
      if (fresh) {
        assert.match(JSON.stringify(entries.data), /handoff/);
        assert.doesNotMatch(JSON.stringify(entries.data), /"content":"Plan the work"/);
        const writesBeforeReplay = client.records.filter((record) => record.type === "tool_execution_start").length;
        await client.response({ type: "prompt", message: "/plan adopt consumed" });
        assert.equal(client.records.filter((record) => record.type === "tool_execution_start").length, writesBeforeReplay);
      }
    });
  });
}

test("RPC questions support a custom answer and cancellation without a proposal", async () => {
  await fixture("question", async (client) => {
    await client.response({ type: "prompt", message: "Aclara las mejoras" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    client.answer(dialog, "Enter a free-form answer…");
    const input = await client.wait((record) => record.type === "extension_ui_request" && record.method === "input");
    client.answer(input, "Prefiero una alternativa distinta");
    await client.wait((record) => record.type === "agent_settled");
    const messages = await client.response({ type: "get_messages" });
    assert.match(JSON.stringify(messages.data), /Prefiero una alternativa distinta/);
  });
  await fixture("question", async (client) => {
    await client.response({ type: "prompt", message: "Aclara las mejoras" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    client.answer(dialog);
    await client.wait((record) => record.type === "agent_settled");
    await assert.rejects(readdir(join(client.root, ".pi/plans")));
    const messages = await client.response({ type: "get_messages" });
    assert.match(JSON.stringify(messages.data), /cancelled/);
  });
});

test("new input invalidates an open approval and stale UI replies cannot execute", async () => {
  await fixture("plan", async (client) => {
    await client.response({ type: "prompt", message: "Plan this" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    const offset = client.records.length;
    await client.response({ type: "prompt", message: "Change the scope before implementation", streamingBehavior: "steer" });
    client.answer(dialog, "Execute in this conversation");
    await client.wait((record) => record.type === "agent_settled", offset);
    await assert.rejects(readFile(join(client.root, "implementation.txt")));
    const entries = await client.response({ type: "get_entries" });
    assert.equal(snapshot(entries).proposal?.review, "stale");
    await client.response({ type: "prompt", message: "/plan apply forged" });
    const unchanged = await client.response({ type: "get_entries" });
    assert.equal(snapshot(unchanged).enabled, true);
  });
});

test("session replacement and fork restore branch state without importing another proposal", async () => {
  await fixture("plan", async (client) => {
    await client.response({ type: "prompt", message: "Plan this el original" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    client.answer(dialog, "Continue planning");
    await client.wait((record) => record.type === "agent_settled");
    const originalState = await client.response({ type: "get_state" });
    const originalFile = data(originalState).sessionFile;
    assert.equal(typeof originalFile, "string");
    const originalProposal = snapshot(await client.response({ type: "get_entries" })).proposal?.id;
    const beforeNew = client.records.length;
    await client.response({ type: "new_session" });
    assert.equal(snapshot(await client.response({ type: "get_entries" })).proposal, undefined);
    await client.response({ type: "prompt", message: "/plan off" });
    await client.response({ type: "prompt", message: "A simple explanation" });
    await client.wait((record) => record.type === "agent_settled", beforeNew);
    assert.equal(snapshot(await client.response({ type: "get_entries" })).enabled, false);
    assert.ok(typeof originalFile === "string");
    await client.response({ type: "switch_session", sessionPath: originalFile });
    assert.equal(snapshot(await client.response({ type: "get_entries" })).proposal?.id, originalProposal);
    const blocked = await client.response({ type: "bash", command: "touch should-not-exist" });
    assert.match(JSON.stringify(blocked.data), /blocks/);
    const forkMessages = data(await client.response({ type: "get_fork_messages" })).messages;
    assert.ok(Array.isArray(forkMessages));
    const user = forkMessages.find((item: unknown) => isObject(item) && typeof item.entryId === "string");
    assert.ok(isObject(user) && typeof user.entryId === "string");
    await client.response({ type: "fork", entryId: user.entryId });
    const forked = snapshot(await client.response({ type: "get_entries" }));
    assert.equal(forked.enabled, true);
    assert.equal(forked.proposal, undefined);
  }, true);
});

test("real Git inspection is read-only and ordinary write calls remain blocked", async () => {
  await fixture("inspect", async (client) => {
    execFileSync("git", ["init", "--quiet"], { cwd: client.root });
    await client.response({ type: "prompt", message: "Inspecciona Git" });
    await client.wait((record) => record.type === "agent_settled");
    assert.match(JSON.stringify((await client.response({ type: "get_messages" })).data), /INSPECTED/);
  });
  await fixture("blocked", async (client) => {
    await client.response({ type: "prompt", message: "Try writing while planning" });
    await client.wait((record) => record.type === "agent_settled");
    await assert.rejects(readFile(join(client.root, "unauthorized.txt")));
  });
});

for (const mode of ["text", "json"]) {
  test(`${mode} mode returns a plan or pending questions without UI or execution`, async () => {
    for (const scenario of ["plan", "question"]) {
      const root = await mkdtemp(join(tmpdir(), "pi-plan-headless-"));
      try {
        const output = execFileSync("pi", [
          "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve", "--no-session",
          "--extension", resolve("extensions/plan-mode/index.ts"), "--extension", resolve("test/fixtures/provider.ts"),
          "--provider", "plan-fixture", "--model", "local", "--plan", "--mode", mode, "-p", "Plan the work",
        ], { cwd: root, env: { ...process.env, PI_CODING_AGENT_DIR: join(root, "agent"), PI_PLAN_SCENARIO: scenario }, encoding: "utf8", timeout: 15000 });
        assert.match(output, scenario === "plan" ? /# Example plan/ : /PENDING QUESTION/);
        if (mode === "json") {
          for (const line of output.trim().split("\n")) assert.ok(isRecord(JSON.parse(line)));
          assert.doesNotMatch(output, /extension_ui_request/);
        }
        await assert.rejects(readFile(join(root, "implementation.txt")));
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });
}

test("RPC blocks deferred mutating tools called from a read-only wrapper", async () => {
  await fixture("nested", async (client) => {
    await client.response({ type: "prompt", message: "Explore" });
    await client.wait((record) => record.type === "agent_settled");
    const messages = await client.response({ type: "get_messages" });
    assert.match(JSON.stringify(messages.data), /NESTED_BLOCKED/);
  });
});

test("RPC refinement creates a new proposal and preserves previous Markdown", async () => {
  await fixture("plan", async (client) => {
    await client.response({ type: "prompt", message: "Plan this" });
    const first = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    assert.ok(first.options?.includes("Refine the plan"), "the refinement action must be offered before selecting it");
    client.answer(first, "Refine the plan");
    const input = await client.wait((record) => record.type === "extension_ui_request" && record.method === "input");
    const offset = client.records.length;
    client.answer(input, "Improve simplicity");
    const revised = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select", offset);
    assert.match(revised.title ?? "", /Review 2/);
    client.answer(revised, "Continue planning");
    await client.wait((record) => record.type === "agent_settled", offset);
    assert.equal((await readdir(join(client.root, ".pi/plans"))).length, 2);
  });
});

test("a failed Markdown export keeps the session proposal and review can retry", async () => {
  await fixture("plan", async (client) => {
    await writeFile(join(client.root, ".pi"), "Obstruction used only by this test");
    await client.response({ type: "prompt", message: "Plan this" });
    await client.wait((record) => record.type === "agent_settled");
    const failed = snapshot(await client.response({ type: "get_entries" }));
    assert.equal(failed.proposal?.review, "held");
    assert.equal(failed.proposal?.file, undefined);
    assert.match(failed.proposal?.markdown ?? "", /## Decisions/);
    assert.ok(!client.records.some((record) => record.type === "extension_ui_request" && record.method === "select"));
    await assert.rejects(readFile(join(client.root, "implementation.txt")));
    await rm(join(client.root, ".pi"));
    const offset = client.records.length;
    client.send({ type: "prompt", message: "/plan review", id: "retry-review" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select", offset);
    client.answer(dialog, "Continue planning");
    await client.wait((record) => record.type === "response" && record.id === "retry-review");
    const recovered = snapshot(await client.response({ type: "get_entries" }));
    assert.equal(recovered.proposal?.id, failed.proposal?.id);
    assert.ok(recovered.proposal?.file);
    assert.equal((await readdir(join(client.root, ".pi/plans"))).length, 1);
    const blocked = await client.response({ type: "bash", command: "touch unauthorized.txt" });
    assert.match(JSON.stringify(blocked.data), /blocks/);
  });
});

test("reload restores the current proposal without reopening its approval", async () => {
  await fixture("plan", async (client) => {
    await client.response({ type: "prompt", message: "Plan this" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    client.answer(dialog, "Continue planning");
    await client.wait((record) => record.type === "agent_settled");
    const before = snapshot(await client.response({ type: "get_entries" }));
    const offset = client.records.length;
    await client.response({ type: "prompt", message: "/fixture_reload" });
    assert.deepEqual(snapshot(await client.response({ type: "get_entries" })), before);
    assert.ok(!client.records.slice(offset).some((record) => record.type === "extension_ui_request" && record.method === "select"));
    const blocked = await client.response({ type: "bash", command: "touch unauthorized.txt" });
    assert.match(JSON.stringify(blocked.data), /blocks/);
    await assert.rejects(readFile(join(client.root, "implementation.txt")));
  });
});

test("a cancelled fresh session returns to planning without executing", async () => {
  await fixture("cancel-session", async (client) => {
    const original = data(await client.response({ type: "get_state" })).sessionId;
    await client.response({ type: "prompt", message: "Plan this" });
    const dialog = await client.wait((record) => record.type === "extension_ui_request" && record.method === "select");
    client.answer(dialog, "Execute in a clean session");
    await client.wait((record) => record.type === "extension_ui_request" && record.method === "notify" && JSON.stringify(record).includes("New session cancelled"));
    const restored = snapshot(await client.response({ type: "get_entries" }));
    assert.equal(restored.enabled, true);
    assert.equal(restored.proposal?.review, "held");
    assert.equal(data(await client.response({ type: "get_state" })).sessionId, original);
    await assert.rejects(readFile(join(client.root, "implementation.txt")));
  });
});
