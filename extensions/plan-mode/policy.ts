import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { PLAN_TOOLS, READ_TOOLS } from "./state.ts";

const EXECUTORS = new Set(["bash", "powershell", "codemode", "edit", "write"]);

export function allowsTool(tool: ToolInfo | undefined): boolean {
  if (!tool || EXECUTORS.has(tool.name)) return false;
  if (READ_TOOLS.includes(tool.name) && tool.sourceInfo.path === `builtin:${tool.name}`) return true;
  return tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint !== true;
}

export function planningTools(all: readonly ToolInfo[], previous: readonly string[]): string[] {
  return [...new Set([
    ...previous.filter((name) => allowsTool(all.find((tool) => tool.name === name))),
    ...READ_TOOLS.filter((name) => allowsTool(all.find((tool) => tool.name === name))),
    ...PLAN_TOOLS.filter((name) => all.some((tool) => tool.name === name)),
  ])];
}

export type GitOperation = "status" | "diff" | "log" | "show";

export function gitArguments(operation: GitOperation, ref?: string, path?: string): string[] {
  if (ref !== undefined && (!/^[a-zA-Z0-9][a-zA-Z0-9_./~^@{}+-]{0,199}$/.test(ref) || ref.includes(".."))) {
    throw new Error("Invalid Git ref; use a hash or single ref, without options or ranges.");
  }
  const prefix = ["--no-pager", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "log.showSignature=false", "-c", "diff.submodule=short"];
  switch (operation) {
    case "status": return [...prefix, "status", "--short", "--branch", "--", ...(path ? [path] : [])];
    case "diff": return [...prefix, "diff", "--no-ext-diff", "--no-textconv", ...(ref ? [ref] : []), "--", ...(path ? [path] : [])];
    case "log": return [...prefix, "log", "-20", "--format=short", ...(ref ? [ref] : []), "--", ...(path ? [path] : [])];
    case "show": return [...prefix, "show", "--no-ext-diff", "--no-textconv", ref ?? "HEAD", "--", ...(path ? [path] : [])];
  }
}
