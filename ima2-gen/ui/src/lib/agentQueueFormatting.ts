import type { AgentQueueItem } from "../components/agent/agentTypes";

export function formatAgentQueueStatus(item: AgentQueueItem): string {
  if (item.status === "queued") return `#${item.position}`;
  if (item.status === "succeeded") return String(item.resultImageIds.length);
  return "";
}

export function formatAgentQueueTime(timestamp: number | null | undefined, format: (value: number, unit: "second" | "minute" | "hour") => string): string {
  if (!timestamp) return "-";
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? format(minutes, "minute") : format(Math.round(minutes / 60), "hour");
}
