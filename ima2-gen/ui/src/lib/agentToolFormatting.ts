import type { AgentToolCallSummary, AgentToolName, AgentTurn } from "../components/agent/agentTypes";

const TOOL_NAMES: AgentToolName[] = [
  "ima2.get_image_context",
  "ima2.web_search",
  "ima2.generate_image",
  "ima2.generate_video",
  "ima2.get_generation_errors",
];

export function formatAgentToolLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim() || "tool";
}

export function getAgentToolCalls(turn: AgentTurn): AgentToolCallSummary[] {
  if (turn.toolCalls?.length) return turn.toolCalls;
  const text = formatAgentToolLabel(turn.text);
  return TOOL_NAMES
    .filter((name) => text.includes(name))
    .map((name, index) => ({
      id: `${turn.id}-fallback-${index}`,
      name,
      status: turn.status === "error" ? "error" : turn.status === "streaming" ? "running" : "complete",
      outputSummary: text,
      imageIds: name === "ima2.generate_image" || name === "ima2.generate_video" ? turn.imageIds ?? [] : [],
      webFindingIds: name === "ima2.web_search" ? turn.webFindingIds ?? [] : [],
    }));
}

export function formatDuration(durationMs?: number | null): string | null {
  if (!durationMs || durationMs < 0) return null;
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}
