// Offline scripted provider. Not included in the package manifest or published files.
import { createAssistantMessageEventStream, getCurrentSystemMessage, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage, type JsonObject, type TextContent, type ToolCall, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { RECOVER_WORKFLOW } from "../../extensions/plan-mode/prompt.ts";

function userText(content: UserMessage["content"]): string {
  return typeof content === "string" ? content : content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
}

export const FIXTURE_PLAN = `# Example plan

## Goal
Create implementation.txt with the approved content.

## Decisions
Keep the scope small and verify the result by reading it.

## Implementation
1. Write implementation.txt.
2. Check its contents.

## Tests and assumptions
The file must contain APPROVED. No external services are required.`;

export default function fixtureProvider(pi: ExtensionAPI): void {
  let requests = 0;
  pi.registerCommand("fixture_reload", {
    description: "Reload only the isolated test runtime",
    handler: async (_args, ctx) => { await ctx.reload(); },
  });
  pi.on("session_before_switch", (event) => {
    if (process.env.PI_PLAN_SCENARIO === "cancel-session" && event.reason === "new") return { cancel: true };
  });
  pi.registerTool({
    name: "fixture_write", label: "Fixture write", description: "A deferred mutating fixture",
    parameters: Type.Object({}), exposure: "deferred", annotations: { readOnlyHint: false },
    async execute() { throw new Error("A mutating deferred tool must never execute in plan mode"); },
  });
  pi.registerTool({
    name: "fixture_nested", label: "Nested fixture", description: "Fixture for checking nested tool hooks",
    parameters: Type.Object({}), annotations: { readOnlyHint: true },
    async execute(_id, _args, signal, _update, ctx) {
      const result = await ctx.executeTool("fixture_write", {}, { signal });
      return { content: [{ type: "text", text: result.isError ? "NESTED_BLOCKED" : "UNEXPECTED_WRITE" }], details: { blocked: result.isError } };
    },
  });
  pi.registerProvider("plan-fixture", {
    api: "openai-completions", baseUrl: "https://fixture.invalid", apiKey: "unused-offline-fixture",
    models: ["local", "alternate"].map((id) => ({ id, name: `Offline fixture ${id}`, reasoning: true, input: ["text"], contextWindow: 64000, maxTokens: 4000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const count = requests++;
      const scenario = process.env.PI_PLAN_SCENARIO ?? "plan";
      pi.appendEntry("plan-fixture.request", {
        sections: getCurrentSystemMessage(context.messages)?.sections,
        tools: getCurrentTools(context.messages).map((tool) => tool.name),
      });
      const latestUser = [...context.messages].reverse().find((message) => message.role === "user" && userText(message.content).trim() !== RECOVER_WORKFLOW.trim());
      const prompt = latestUser?.role === "user" ? userText(latestUser.content) : "";
      const tool = (name: string, args: JsonObject): ToolCall => ({ type: "toolCall", id: `fixture-${count}`, name, arguments: args });
      let content: TextContent | ToolCall;
      if (prompt.startsWith("Implement the explicitly approved plan")) {
        const latestResult = [...context.messages].reverse().find((message) => message.role === "toolResult");
        content = latestResult?.role === "toolResult" && latestResult.toolName === "write"
          ? { type: "text", text: "IMPLEMENTED" }
          : tool("write", { path: "implementation.txt", content: "APPROVED\n" });
      } else if (scenario === "recovery") {
        const turnMessages = context.messages.slice((latestUser ? context.messages.lastIndexOf(latestUser) : -1) + 1);
        const recovered = turnMessages.some((message) => message.role === "user" && userText(message.content).trim() === RECOVER_WORKFLOW.trim());
        const answered = turnMessages.some((message) => message.role === "toolResult" && message.toolName === "plan_ask");
        const submitted = turnMessages.some((message) => message.role === "toolResult" && message.toolName === "plan_submit");
        if (submitted) content = { type: "text", text: "Plan ready for review." };
        else if (!recovered) content = { type: "text", text: "Here is the updated approach. Use /plan off to implement it." };
        else if (!answered) content = tool("plan_ask", { questions: [{ question: "Keep the revised scope small?" }] });
        else content = tool("plan_submit", { title: "Revised plan", markdown: FIXTURE_PLAN });
      } else if (scenario === "text-only") {
        content = { type: "text", text: "A prose-only planning response." };
      } else if (scenario === "nested") {
        content = count === 0 ? tool("fixture_nested", {}) : { type: "text", text: "NESTED_BLOCKED" };
      } else if (scenario === "blocked") {
        content = count === 0 ? tool("write", { path: "unauthorized.txt", content: "BAD" }) : { type: "text", text: "BLOCKED" };
      } else if (scenario === "question" && count === 0) {
        content = getCurrentTools(context.messages).some((item) => item.name === "plan_ask")
          ? tool("plan_ask", { questions: [{ question: "Should we include a simplification improvement?", options: [{ label: "Yes", description: "Reduces complexity without changing the goal", recommended: true }, { label: "No", description: "Keeps the original scope" }] }] })
          : { type: "text", text: "PENDING QUESTION: Should we include a simplification improvement?" };
      } else if (scenario === "question") {
        content = { type: "text", text: "ANSWER RECEIVED" };
      } else if (scenario === "inspect") {
        content = count === 0 ? tool("plan_inspect", { operation: "status" }) : { type: "text", text: "INSPECTED" };
      } else if (count === 0 || prompt.startsWith("Refine")) {
        content = tool("plan_submit", { title: prompt.startsWith("Refine") ? "Refined plan" : "Example plan", markdown: FIXTURE_PLAN + (prompt.startsWith("Refine") ? "\n\nAccepted improvement: keep the scope small." : "") });
      } else {
        content = { type: "text", text: getCurrentSystemPrompt(context.messages).includes("PLAN MODE") ? FIXTURE_PLAN : "DONE" };
      }
      queueMicrotask(() => {
        const message: AssistantMessage = {
          role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop", timestamp: Date.now(),
        };
        if (options?.signal?.aborted || scenario === "aborted" || scenario === "error") {
          message.stopReason = scenario === "error" ? "error" : "aborted";
          message.errorMessage = scenario === "error" ? "Fixture provider failure" : "Fixture aborted";
          stream.push({ type: "error", reason: message.stopReason, error: message });
          stream.end();
          return;
        }
        stream.push({ type: "start", partial: message });
        message.content.push(content);
        if (content.type === "toolCall") {
          stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
          stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: content, partial: message });
          message.stopReason = "toolUse";
        } else {
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          stream.push({ type: "text_delta", contentIndex: 0, delta: content.text, partial: message });
          stream.push({ type: "text_end", contentIndex: 0, content: content.text, partial: message });
        }
        stream.push({ type: "done", reason: content.type === "toolCall" ? "toolUse" : "stop", message });
        stream.end();
      });
      return stream;
    },
  });
}
