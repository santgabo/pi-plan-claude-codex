import { randomUUID } from "node:crypto";
import { StringEnum } from "@earendil-works/pi-ai";
import { getMarkdownTheme, truncateHead, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { allowsTool, gitArguments, planningTools } from "./policy.ts";
import { executionPrompt, WORKFLOW } from "./prompt.ts";
import { emptyState, invalidateProposal, isState, PLAN_TOOLS, restoreState, STATE_TYPE, type PlanState, type Proposal } from "./state.ts";
import { saveProposal } from "./storage.ts";

const HANDOFF_TYPE = "pi-plan-claude-codex.handoff";
const PLAN_MESSAGE = "pi-plan-claude-codex.proposal";
const Question = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 2000 }),
  options: Type.Optional(Type.Array(Type.Object({
    label: Type.String({ minLength: 1, maxLength: 150 }),
    description: Type.String({ minLength: 1, maxLength: 1000 }),
    recommended: Type.Optional(Type.Boolean()),
  }), { minItems: 2, maxItems: 4 })),
});

interface Approval {
  token: string;
  epoch: number;
  sessionId: string;
  proposalId: string;
  fresh: boolean;
}

interface Handoff {
  token: string;
  state: PlanState;
  tools: string[];
  model?: { provider: string; id: string };
  thinkingLevel?: ExtensionContext["thinkingLevel"];
  source?: string;
}

function isHandoff(value: unknown): value is Handoff {
  if (typeof value !== "object" || value === null || !("token" in value) || !("state" in value) || !("tools" in value)) return false;
  if (typeof value.token !== "string" || !isState(value.state) || !Array.isArray(value.tools) || !value.tools.every((name: unknown) => typeof name === "string")) return false;
  if ("model" in value && value.model !== undefined && (typeof value.model !== "object" || value.model === null || !("provider" in value.model) || !("id" in value.model) || typeof value.model.provider !== "string" || typeof value.model.id !== "string")) return false;
  if ("thinkingLevel" in value && value.thinkingLevel !== undefined && (typeof value.thinkingLevel !== "string" || !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value.thinkingLevel))) return false;
  return !("source" in value) || value.source === undefined || typeof value.source === "string";
}

export default function planMode(pi: ExtensionAPI): void {
  let state = emptyState();
  let epoch = 0;
  let interaction = new AbortController();
  let unanswered = false;
  let hasDialogs = false;
  let approval: Approval | undefined;

  function cancelInteraction(): void {
    epoch++;
    approval = undefined;
    interaction.abort();
    interaction = new AbortController();
  }

  function persist(): void {
    pi.appendEntry(STATE_TYPE, structuredClone(state));
  }

  function updateUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const proposal = state.proposal;
    ctx.ui.setStatus("plan-mode", state.enabled ? "⏸ plan" : undefined);
    ctx.ui.setWidget("plan-mode", state.enabled ? [
      "Plan mode · explore → discuss → review",
      proposal ? `${proposal.title} · revision ${proposal.revision} · ${proposal.review}` : "Questions and improvements before implementation",
      ...(proposal?.file ? [`Markdown: ${proposal.file}`] : []),
    ] : undefined);
  }

  function applyTools(): void {
    if (state.enabled) pi.setActiveTools(planningTools(pi.getAllTools(), state.toolsBeforePlan ?? []).filter((name) => hasDialogs || name !== "plan_ask"));
  }

  function enable(ctx: ExtensionContext): void {
    if (state.enabled) return;
    cancelInteraction();
    state.enabled = true;
    state.toolsBeforePlan = pi.getActiveTools().filter((name) => !PLAN_TOOLS.includes(name));
    unanswered = false;
    applyTools();
    persist();
    updateUI(ctx);
  }

  function disable(ctx: ExtensionContext): void {
    cancelInteraction();
    pi.setActiveTools(state.toolsBeforePlan ?? pi.getActiveTools().filter((name) => !PLAN_TOOLS.includes(name)));
    state.enabled = false;
    state.toolsBeforePlan = undefined;
    unanswered = false;
    persist();
    updateUI(ctx);
  }

  function restore(ctx: ExtensionContext): void {
    const previousTools = state.enabled ? state.toolsBeforePlan : undefined;
    cancelInteraction();
    hasDialogs = ctx.hasUI;
    state = restoreState(ctx.sessionManager.getBranch());
    unanswered = false;
    if (!state.enabled && previousTools && pi.getActiveTools().some((name) => PLAN_TOOLS.includes(name))) {
      pi.setActiveTools(previousTools);
    }
    applyTools();
    updateUI(ctx);
  }

  async function command(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const text = args.trim();
    if (text.startsWith("apply ")) {
      await executeApproval(text.slice(6), ctx);
      return;
    }
    if (text.startsWith("adopt ")) {
      await adopt(text.slice(6), ctx);
      return;
    }
    if (!ctx.isIdle()) {
      ctx.ui.notify("Wait for the turn to finish before changing plan mode.", "warning");
      return;
    }
    if (text === "status") {
      ctx.ui.notify(`${state.enabled ? "Plan mode enabled." : "Plan mode disabled."}${state.proposal ? `\n${state.proposal.title} · revision ${state.proposal.revision} · ${state.proposal.review}\n${state.proposal.file ?? "Markdown export pending."}` : ""}`, "info");
      return;
    }
    if (text === "review" || text === "execute") {
      if (!state.enabled || !state.proposal || state.proposal.review === "stale") {
        ctx.ui.notify("First submit an up-to-date plan with /plan and plan_submit.", "warning");
        return;
      }
      await review(ctx, true);
      return;
    }
    if (text === "off") {
      if (state.enabled) disable(ctx);
      return;
    }
    if (!text && state.enabled) {
      disable(ctx);
      ctx.ui.notify("Plan mode disabled.", "info");
      return;
    }
    enable(ctx);
    if (text === "refine" || text.startsWith("refine ")) {
      const comments = text.slice(6).trim() || (ctx.hasUI ? await ctx.ui.input("What would you like to change or improve in the plan?", undefined, { signal: interaction.signal }) : undefined);
      if (comments?.trim()) pi.sendUserMessage(`Refine the current plan with these comments:\n${comments.trim()}`, { expandPromptTemplates: false });
      return;
    }
    if (text && text !== "on") pi.sendUserMessage(text, { expandPromptTemplates: false });
    else ctx.ui.notify("Plan mode enabled. Describe what you want to plan.", "info");
  }

  function dialogSignal(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([signal, interaction.signal]) : interaction.signal;
  }

  async function review(ctx: ExtensionContext, display: boolean): Promise<void> {
    if (!ctx.hasUI || !state.enabled || !state.proposal || state.proposal.review === "stale") return;
    const proposal = state.proposal;
    const reviewEpoch = epoch;
    const signal = dialogSignal(ctx.signal);
    if (!proposal.file) {
      try { proposal.file = await saveProposal(ctx.cwd, proposal.markdown, signal); }
      catch (error) {
        if (!signal.aborted) ctx.ui.notify(`Could not save the plan: ${String(error)}. Try /plan review again.`, "error");
        return;
      }
    }
    if (reviewEpoch !== epoch || signal.aborted) return;
    proposal.review = "held";
    persist();
    updateUI(ctx);
    if (display) pi.sendMessage({ customType: PLAN_MESSAGE, content: proposal.markdown, display: true }, { triggerTurn: false });
    const choice = await ctx.ui.select(`Review ${proposal.revision}: ${proposal.title}`, [
      "Continue planning", "Refine the plan", "Execute in this conversation", "Execute in a clean session",
    ], { signal });
    if (reviewEpoch !== epoch || signal.aborted || state.proposal?.id !== proposal.id) return;
    if (choice === "Refine the plan") {
      const comments = await ctx.ui.input("What would you like to change or improve?", undefined, { signal });
      if (comments?.trim() && reviewEpoch === epoch && !signal.aborted) {
        pi.sendUserMessage(`Refine the plan with these comments:\n${comments.trim()}`, { deliverAs: "followUp", expandPromptTemplates: false });
      }
    } else if (choice === "Execute in this conversation" || choice === "Execute in a clean session") {
      approval = { token: randomUUID(), epoch, sessionId: ctx.sessionManager.getSessionId(), proposalId: proposal.id, fresh: choice === "Execute in a clean session" };
      // Commands execute immediately, then wait for idle without blocking this lifecycle handler.
      pi.sendUserMessage(`/plan apply ${approval.token}`, { expandPromptTemplates: true, deliverAs: "followUp" });
    }
  }

  async function executeApproval(token: string, ctx: ExtensionCommandContext): Promise<void> {
    const selected = approval;
    if (!selected || selected.token !== token || !ctx.hasUI) return;
    await ctx.waitForIdle();
    if (approval !== selected || epoch !== selected.epoch) return;
    if (ctx.hasPendingMessages() || ctx.sessionManager.getSessionId() !== selected.sessionId || state.proposal?.id !== selected.proposalId || state.proposal.review !== "held") return;
    const proposal = structuredClone(state.proposal);
    proposal.review = "approved";
    const handoff: Handoff = {
      token: randomUUID(), state: { version: 1, enabled: false, proposal },
      tools: [...(state.toolsBeforePlan ?? [])],
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
      thinkingLevel: ctx.thinkingLevel,
      source: ctx.sessionManager.getSessionFile(),
    };
    state.proposal = proposal;
    disable(ctx);
    if (!selected.fresh) {
      pi.sendUserMessage(executionPrompt(proposal.title, proposal.markdown, handoff.source), { expandPromptTemplates: false });
      return;
    }
    const result = await ctx.newSession({
      parentSession: handoff.source,
      setup: async (manager) => {
        manager.appendCustomEntry(STATE_TYPE, handoff.state);
        manager.appendCustomEntry(HANDOFF_TYPE, handoff);
      },
      withSession: async (replacement) => {
        await replacement.sendUserMessage(`/plan adopt ${handoff.token}`, { expandPromptTemplates: true });
      },
    });
    if (result.cancelled) {
      // Cancellation preserves the old runtime; success invalidates it, so return without using it.
      enable(ctx);
      if (state.proposal) state.proposal.review = "held";
      persist();
      updateUI(ctx);
      ctx.ui.notify("New session cancelled. The plan is still pending.", "info");
    }
  }

  async function adopt(token: string, ctx: ExtensionCommandContext): Promise<void> {
    if (token === "consumed") return;
    const entry = [...ctx.sessionManager.getBranch()].reverse().find((item) => item.type === "custom" && item.customType === HANDOFF_TYPE && isHandoff(item.data));
    if (!entry || entry.type !== "custom" || !isHandoff(entry.data) || entry.data.token !== token || !ctx.isIdle()) return;
    const handoff = entry.data;
    const proposal = handoff.state.proposal;
    if (!proposal || proposal.review !== "approved") return;
    // This handler belongs to the fresh runtime; do not use the planning runtime's pi/ctx here.
    if (handoff.model) {
      const model = ctx.modelRegistry.find(handoff.model.provider, handoff.model.id);
      if (!model || !(await pi.setModel(model))) {
        ctx.ui.notify("Could not preserve the planning model. The plan is saved; select a model before implementation.", "error");
        return;
      }
    }
    if (handoff.thinkingLevel) pi.setThinkingLevel(handoff.thinkingLevel);
    state = structuredClone(handoff.state);
    pi.setActiveTools(handoff.tools);
    pi.appendEntry(HANDOFF_TYPE, { ...handoff, token: "consumed" });
    persist();
    updateUI(ctx);
    pi.sendUserMessage(executionPrompt(proposal.title, proposal.markdown, handoff.source), { expandPromptTemplates: false });
  }

  pi.registerTool({
    name: "plan_ask", label: "Plan decisions",
    description: "Ask relevant planning decisions or propose worthwhile improvements. Use options with tradeoffs or a free-form question. Cancellation leaves it unanswered; stop and wait.",
    parameters: Type.Object({ questions: Type.Array(Question, { minItems: 1, maxItems: 3 }) }),
    outputSchema: Type.Object({ status: StringEnum(["answered", "unanswered", "cancelled"] as const), answers: Type.Array(Type.Object({ question: Type.String(), answer: Type.Union([Type.String(), Type.Null()]) })) }),
    exposure: "model-only", defaultActive: false, executionMode: "sequential",
    annotations: { readOnlyHint: true, openWorldHint: false },
    async execute(_id, params, operationSignal, _update, ctx) {
      const signal = dialogSignal(operationSignal);
      signal.throwIfAborted();
      const answers: { question: string; answer: string | null }[] = [];
      let status: "answered" | "unanswered" | "cancelled" = "answered";
      for (const question of params.questions) {
        if (!question.question.trim()) throw new Error("The question cannot be empty.");
        if (question.options && (new Set(question.options.map((option) => option.label.trim())).size !== question.options.length || question.options.filter((option) => option.recommended).length > 1)) throw new Error("Use distinct options and at most one recommendation.");
        let answer: string | undefined;
        if (ctx.hasUI) {
          if (question.options) {
            const labels = question.options.map((option) => `${option.label}${option.recommended ? " (Recommended)" : ""} — ${option.description}`);
            const custom = "Enter a free-form answer…";
            const choice = await ctx.ui.select(question.question, [...labels, custom], { signal });
            signal.throwIfAborted();
            if (choice === custom) answer = await ctx.ui.input(question.question, undefined, { signal });
            else if (choice !== undefined) answer = question.options[labels.indexOf(choice)]?.label;
          } else answer = await ctx.ui.input(question.question, undefined, { signal });
          signal.throwIfAborted();
        }
        answers.push({ question: question.question, answer: answer?.trim() || null });
        if (!answer?.trim()) {
          status = ctx.hasUI ? "cancelled" : "unanswered";
          unanswered = true;
          break;
        }
      }
      const data = { status, answers };
      return {
        content: [{ type: "text", text: status === "answered" ? JSON.stringify(data) : `Pending questions: ${JSON.stringify(params.questions)}\n${JSON.stringify(data)}\nDo not invent answers; present the questions and wait for the user.` }],
        details: data, structuredContent: data, terminate: ctx.hasUI && status !== "answered",
      };
    },
  });

  pi.registerTool({
    name: "plan_submit", label: "Plan proposal",
    description: "Present a complete self-contained Markdown plan only after consequential decisions are resolved. Include behavior/interfaces, accepted improvements, implementation steps, tests, and assumptions. Replaces the prior proposal; does not approve execution.",
    parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 200 }), markdown: Type.String({ minLength: 1, maxLength: 120000 }) }),
    outputSchema: Type.Object({ id: Type.String(), revision: Type.Integer(), saved: Type.Boolean(), file: Type.Union([Type.String(), Type.Null()]) }),
    exposure: "model-only", defaultActive: false, executionMode: "sequential",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async execute(_id, params, operationSignal, _update, ctx) {
      const signal = dialogSignal(operationSignal);
      signal.throwIfAborted();
      if (!params.title.trim() || !params.markdown.trim()) throw new Error("The title and plan cannot be empty.");
      const proposal: Proposal = { id: randomUUID(), revision: (state.proposal?.revision ?? 0) + 1, title: params.title.trim(), markdown: params.markdown.trim(), review: "pending" };
      let error: unknown;
      try { proposal.file = await saveProposal(ctx.cwd, proposal.markdown, signal); }
      catch (failure) { if (signal.aborted) throw failure; error = failure; }
      signal.throwIfAborted();
      state.proposal = { ...proposal, review: error ? "held" : "pending" };
      persist();
      updateUI(ctx);
      const data = { id: proposal.id, revision: proposal.revision, saved: !!proposal.file, file: proposal.file ?? null };
      return {
        content: [{ type: "text", text: `${proposal.markdown}\n\n${error ? `Could not save Markdown: ${String(error)}. Try /plan review again.` : `Saved: ${proposal.file}. ${ctx.hasUI ? "The user will choose how to continue." : "Include this plan in your final response and remain in plan mode."}`}` }],
        details: data, structuredContent: data, isError: !!error, terminate: ctx.hasUI && !error,
      };
    },
    renderResult(result) {
      return new Markdown(result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n"), 0, 0, getMarkdownTheme());
    },
  });

  pi.registerTool({
    name: "plan_inspect", label: "Git inspection",
    description: "Read-only Git inspection with fixed operations; no arbitrary shell or flags. Use built-in read/search tools for other project discovery.",
    parameters: Type.Object({ operation: StringEnum(["status", "diff", "log", "show"] as const), ref: Type.Optional(Type.String({ maxLength: 200 })), path: Type.Optional(Type.String({ maxLength: 4096 })) }),
    outputSchema: Type.Object({ output: Type.String(), truncated: Type.Boolean() }),
    defaultActive: false, executionMode: "parallel",
    annotations: { readOnlyHint: true, openWorldHint: false },
    async execute(_id, params, signal, _update, ctx) {
      signal?.throwIfAborted();
      const result = await pi.exec("git", gitArguments(params.operation, params.ref, params.path), { cwd: ctx.cwd, signal, timeout: 10000 });
      signal?.throwIfAborted();
      if (result.killed || result.code !== 0) throw new Error(result.killed ? "Git query timed out." : `Git: ${result.stderr || "the query failed"}`);
      const output = truncateHead(result.stdout, { maxLines: 1000, maxBytes: 30000 });
      const data = { output: output.content, truncated: output.truncated };
      return { content: [{ type: "text", text: `${data.output}${data.truncated ? "\n[Salida truncada; acota la consulta con path.]" : ""}` }], details: data, structuredContent: data };
    },
  });

  pi.registerFlag("plan", { description: "Start in conversational plan mode", type: "boolean", default: false });
  pi.registerCommand("plan", { description: "Plan before implementation", handler: command });
  pi.registerMessageRenderer(PLAN_MESSAGE, (message) => new Markdown(typeof message.content === "string" ? message.content : "", 0, 0, getMarkdownTheme()));
  pi.on("session_start", (_event, ctx) => {
    restore(ctx);
    if (pi.getFlag("plan") === true && !ctx.sessionManager.getBranch().some((entry) => entry.type === "custom" && entry.customType === STATE_TYPE)) {
      enable(ctx);
    }
  });
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", () => cancelInteraction());
  pi.on("input", (_event, ctx) => {
    cancelInteraction();
    unanswered = false;
    if (state.enabled && state.proposal) {
      invalidateProposal(state);
      persist();
      updateUI(ctx);
    }
    return { action: "continue" };
  });
  pi.on("before_agent_start", (event, ctx) => {
    hasDialogs = ctx.hasUI;
    if (state.enabled) {
      applyTools();
      event.systemPromptOptions.sections.plan_mode = WORKFLOW;
      if (state.proposal) event.systemPromptOptions.sections.plan_proposal = state.proposal.markdown;
      event.systemPromptOptions.sections.plan_interaction = ctx.hasUI ? "Use plan_ask dialogs for consequential questions." : "No interactive UI is available. Ask unresolved questions in your final response and stop. Never approve or execute. When a plan is complete, submit it and include its full Markdown in your final response.";
    } else {
      delete event.systemPromptOptions.sections.plan_mode;
      delete event.systemPromptOptions.sections.plan_proposal;
      delete event.systemPromptOptions.sections.plan_interaction;
    }
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    if (event.outcome === "completed" && !event.continue && !ctx.hasPendingMessages() && state.enabled && state.proposal?.review === "pending") await review(ctx, false);
  });
  pi.on("tool_call", (event) => {
    if (!state.enabled) {
      if (PLAN_TOOLS.includes(event.toolName)) return { block: true, reason: "Enable /plan to use this tool." };
      return;
    }
    if (PLAN_TOOLS.includes(event.toolName)) {
      if (unanswered && event.toolName !== "plan_inspect") return { block: true, reason: "There is an unanswered question. Wait for the user.", terminate: true };
      return;
    }
    if (!allowsTool(pi.getAllTools().find((tool) => tool.name === event.toolName))) {
      return { block: true, reason: "Plan mode: this tool is not enabled for reading. Review the plan before execution." };
    }
  });
  pi.on("user_bash", () => {
    if (state.enabled) return { result: {
      output: "Plan mode blocks ! and !!. Use read-only tools or exit with /plan off.",
      exitCode: 1, cancelled: false, truncated: false,
    } };
  });
}
