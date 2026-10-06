import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DefaultResourceLoader, ExtensionRunner, ModelRegistry, ModelRuntime, SessionManager, type ExtensionCommandContext, type ExtensionUIContext, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { matchesKey, setKittyProtocolActive } from "@earendil-works/pi-tui";
import planMode from "../extensions/plan-mode/index.ts";
import { restoreState, STATE_TYPE, type PlanState } from "../extensions/plan-mode/state.ts";

const normalTools = ["write", "read", "external_read", "bash"];
const allTools: ToolInfo[] = [...normalTools, "grep", "plan_ask", "plan_submit", "plan_inspect"].map((name) => ({
  name, description: name, parameters: {}, exposure: "direct",
  annotations: name === "external_read" ? { readOnlyHint: true } : undefined,
  sourceInfo: { path: name === "external_read" ? "fixture.ts" : `builtin:${name}`, source: "test", scope: "temporary", origin: "top-level" },
}));

async function harness(t: TestContext, options: { flag?: boolean; saved?: PlanState } = {}) {
  const root = await mkdtemp(join(tmpdir(), "pi-plan-shortcut-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // Real host registration and contexts; only session actions and UI are doubled.
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: join(root, "agent"), extensionFactories: [planMode],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const manager = SessionManager.inMemory(root);
  if (options.saved) manager.appendCustomEntry(STATE_TYPE, options.saved);
  const models = await ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: null, modelsStorePath: join(root, "models"), allowModelNetwork: false, refreshOnCreate: false });
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, root, manager, new ModelRegistry(models));
  runner.onError((error) => assert.fail(error.error));
  let idle = true;
  let tools = [...normalTools];
  const toolChanges: string[][] = [];
  const messages: unknown[] = [];
  const notifications: unknown[] = [];
  const statuses: unknown[] = [];
  const widgets: unknown[] = [];
  const unexpected = (): never => { throw new Error("Unexpected side effect"); };
  runner.bindCore({
    ...loaded.runtime,
    getActiveTools: () => [...tools], getAllTools: () => allTools, getThinkingLevel: () => "off",
    setActiveTools: (names) => { tools = [...names]; toolChanges.push(tools); },
    appendEntry: (type, data) => { manager.appendCustomEntry(type, data); },
    sendUserMessage: (content) => { messages.push(content); },
    sendMessage: () => {},
  }, {
    getModel: () => undefined, getScopedModels: () => [], isIdle: () => idle,
    isProjectTrusted: () => false, getSignal: () => undefined,
    abort: unexpected, hasPendingMessages: () => false, shutdown: unexpected,
    getContextUsage: () => undefined, compact: unexpected, getSystemPrompt: () => "",
  });
  const ui: ExtensionUIContext = {
    ...runner.getUIContext(),
    notify: (text, type) => { notifications.push([text, type]); },
    setStatus: (key, text) => { statuses.push([key, text]); },
    setWidget: (key, content) => { widgets.push([key, content]); },
    setEditorText: unexpected, pasteToEditor: unexpected, onTerminalInput: unexpected,
    select: unexpected, input: unexpected,
  };
  runner.setUIContext(ui, "tui");
  if (options.flag) runner.setFlagValue("plan", true);
  await runner.emit({ type: "session_start", reason: "startup" });
  const shortcuts = runner.getShortcuts({});
  assert.equal(shortcuts.size, 1);
  assert.deepEqual(runner.getShortcutDiagnostics(), []);
  const shortcut = shortcuts.get("ctrl+alt+p");
  assert.ok(shortcut);
  assert.equal(shortcut.description, "Toggle plan mode");
  const command = loaded.extensions[0].commands.get("plan");
  assert.ok(command);
  return {
    runner, manager, ui, messages, notifications, statuses, widgets, toolChanges,
    setIdle: (value: boolean) => { idle = value; },
    toggle: () => shortcut.handler(runner.createContext()),
    command: (args = "", overrides: Partial<ExtensionCommandContext> = {}) => command.handler(args, { ...runner.createCommandContext(), ...overrides }),
    state: () => restoreState(manager.getBranch()),
    effects: () => ({ state: restoreState(manager.getBranch()), tools, toolChanges, notifications, statuses, widgets, messages }),
  };
}

test("fixed shortcut matches legacy, CSI-u, and modifyOtherKeys, not model-selection keys", () => {
  setKittyProtocolActive(false);
  assert.ok(matchesKey("\x1b\x10", "ctrl+alt+p"));
  for (const kitty of [false, true]) {
    setKittyProtocolActive(kitty);
    assert.ok(matchesKey("\x1b[112;7u", "ctrl+alt+p"));
    assert.ok(matchesKey("\x1b[27;7;112~", "ctrl+alt+p"));
    for (const key of ["\x10", "\x1b[112;6u", "\x1bp", "p"]) assert.equal(matchesKey(key, "ctrl+alt+p"), false);
  }
  setKittyProtocolActive(false);
});

test("shortcut and bare command have identical state, tools, UI, and notifications", async (t) => {
  const keyboard = await harness(t);
  const command = await harness(t);
  for (const enabled of [true, false, true, false]) {
    await keyboard.toggle();
    await command.command("  ");
    assert.deepEqual(keyboard.effects(), command.effects());
    assert.equal(keyboard.state().enabled, enabled);
    assert.deepEqual(keyboard.effects().tools, enabled ? ["read", "external_read", "grep", "plan_ask", "plan_submit", "plan_inspect"] : normalTools);
    assert.deepEqual(keyboard.messages, []);
  }
});

test("busy shortcut and command warn without persisting, changing tools, or queuing a toggle", async (t) => {
  for (const flag of [false, true]) {
    const h = await harness(t, { flag });
    h.setIdle(false);
    const before = structuredClone(h.effects());
    const entries = h.manager.getEntries().length;
    await h.toggle();
    await h.command();
    assert.deepEqual(h.notifications.splice(0), [
      ["Wait for the turn to finish before changing plan mode.", "warning"],
      ["Wait for the turn to finish before changing plan mode.", "warning"],
    ]);
    assert.deepEqual(h.effects(), before);
    assert.equal(h.manager.getEntries().length, entries);
    h.setIdle(true);
    assert.equal(h.state().enabled, flag);
    await h.toggle();
    assert.equal(h.state().enabled, !flag);
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function savedProposal(review: "pending" | "held" | "stale"): PlanState {
  return {
    version: 1, enabled: true, toolsBeforePlan: [...normalTools],
    proposal: { id: "00000000-0000-0000-0000-000000000001", revision: 3, title: "Preserve this proposal", markdown: "# Plan", file: "saved.md", review },
  };
}

test("toggling preserves pending, held, and stale proposals and restores the exact previous tools", async (t) => {
  for (const review of ["pending", "held", "stale"] as const) {
    const saved = savedProposal(review);
    const h = await harness(t, { saved, flag: true });
    const restored = h.state().proposal;
    await h.toggle();
    assert.equal(h.state().enabled, false);
    assert.deepEqual(h.effects().tools, normalTools);
    assert.deepEqual(h.state().proposal, restored);
    await h.toggle();
    assert.deepEqual(h.state().proposal, restored);
    assert.deepEqual(h.state().toolsBeforePlan, normalTools);
    assert.deepEqual(h.messages, []);
  }
});

test("shortcut snapshots restore on reload and branch navigation, overriding --plan", async (t) => {
  const h = await harness(t);
  await h.toggle();
  const enabledLeaf = h.manager.getLeafId();
  assert.ok(enabledLeaf);
  await h.toggle();
  const disabledLeaf = h.manager.getLeafId();
  assert.ok(disabledLeaf);
  const resumed = await harness(t, { saved: h.state(), flag: true });
  assert.equal(resumed.state().enabled, false);
  await resumed.toggle();
  assert.equal(resumed.state().enabled, true);
  for (const [leaf, enabled] of [[enabledLeaf, true], [disabledLeaf, false]] as const) {
    const oldLeafId = h.manager.getLeafId();
    h.manager.branch(leaf);
    await h.runner.emit({ type: "session_tree", newLeafId: leaf, oldLeafId });
    assert.equal(h.state().enabled, enabled);
    assert.equal(h.effects().tools.includes("write"), !enabled);
    await h.runner.emit({ type: "session_start", reason: "reload" });
    assert.equal(h.state().enabled, enabled);
  }
});

test("a late review response after toggling cannot request execution", async (t) => {
  const h = await harness(t, { saved: savedProposal("held") });
  const answer = deferred<string | undefined>();
  let signal: AbortSignal | undefined;
  h.runner.setUIContext({ ...h.ui, select: (_title, _options, opts) => { signal = opts?.signal; return answer.promise; } }, "tui");
  const review = h.command("review");
  assert.ok(signal);
  await h.toggle();
  await h.toggle();
  assert.equal(signal.aborted, true);
  answer.resolve("Execute in this conversation");
  await review;
  assert.equal(h.state().proposal?.review, "held");
  assert.deepEqual(h.messages, []);
});

test("toggling invalidates an approval already waiting for idle", async (t) => {
  const h = await harness(t, { saved: savedProposal("held") });
  h.runner.setUIContext({ ...h.ui, select: async () => "Execute in this conversation" }, "tui");
  await h.command("review");
  const approval = h.messages[0];
  assert.equal(typeof approval, "string");
  assert.ok(typeof approval === "string" && approval.startsWith("/plan apply "));
  const idle = deferred<void>();
  const applying = h.command(approval.slice("/plan ".length), { waitForIdle: () => idle.promise });
  await h.toggle();
  await h.toggle();
  idle.resolve();
  await applying;
  await h.command(approval.slice("/plan ".length));
  assert.equal(h.messages.length, 1);
  assert.equal(h.state().enabled, true);
  assert.equal(h.state().proposal?.review, "held");
});
