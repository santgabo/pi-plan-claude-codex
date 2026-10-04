import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export const STATE_TYPE = "pi-plan-claude-codex.state";
export const PLAN_TOOLS = ["plan_ask", "plan_submit", "plan_inspect"];
export const READ_TOOLS = ["read", "grep", "find", "ls"];

export interface Proposal {
  id: string;
  revision: number;
  title: string;
  markdown: string;
  review: "pending" | "held" | "stale" | "approved";
  file?: string;
}

export interface PlanState {
  version: 1;
  enabled: boolean;
  toolsBeforePlan?: string[];
  proposal?: Proposal;
}

export function emptyState(): PlanState {
  return { version: 1, enabled: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProposal(value: unknown): value is Proposal {
  return isRecord(value) && typeof value.id === "string" &&
    /^[0-9a-f-]{36}$/.test(value.id) && Number.isSafeInteger(value.revision) &&
    typeof value.revision === "number" && value.revision > 0 &&
    typeof value.title === "string" && typeof value.markdown === "string" &&
    typeof value.review === "string" && ["pending", "held", "stale", "approved"].includes(value.review) &&
    (value.file === undefined || typeof value.file === "string");
}

export function isState(value: unknown): value is PlanState {
  return isRecord(value) && value.version === 1 && typeof value.enabled === "boolean" &&
    (value.toolsBeforePlan === undefined || (Array.isArray(value.toolsBeforePlan) &&
      value.toolsBeforePlan.every((name: unknown) => typeof name === "string"))) &&
    (value.proposal === undefined || isProposal(value.proposal));
}

export function restoreState(branch: readonly SessionEntry[]): PlanState {
  let state = emptyState();
  for (const entry of branch) {
    if (entry.type === "custom" && entry.customType === STATE_TYPE && isState(entry.data)) {
      state = structuredClone(entry.data);
    }
  }
  return state;
}

export function invalidateProposal(state: PlanState): void {
  if (state.proposal) state.proposal.review = "stale";
}
