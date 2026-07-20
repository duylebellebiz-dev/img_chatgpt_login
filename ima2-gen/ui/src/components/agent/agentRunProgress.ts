import { isLocalTurn } from "./agentLocalTurns";
import type { AgentQueueItem, AgentSessionRunSummary, AgentTurn } from "./agentTypes";

export type AgentRunProgress = {
  active: boolean;
  status: "queued" | "planning" | "running" | "error";
  labelKey: "pendingQueued" | "pendingPlanning" | "pendingGenerating" | "runError";
  queuedCount: number;
  runningCount: number;
  failedCount: number;
  startedAt?: number | null;
  progressStage?: AgentQueueItem["progressStage"];
  jobKind?: "image" | "video";
  variantCount?: number;
  lastError?: string | null;
};

type DeriveAgentRunProgressInput = {
  turns: AgentTurn[];
  queueItems: AgentQueueItem[];
  runSummary?: AgentSessionRunSummary | null;
  localPendingCount: number;
};

export function deriveAgentRunProgress({
  turns,
  queueItems,
  runSummary,
  localPendingCount,
}: DeriveAgentRunProgressInput): AgentRunProgress | null {
  const failedCount = queueItems.filter((item) => item.status === "failed").length;
  const activeItem = findActiveQueueItem(queueItems);
  const activeMeta = activeItem ? getQueueItemProgressMeta(activeItem) : {};

  if (runSummary?.status === "error" && runSummary.lastError) {
    return {
      active: true,
      status: "error",
      labelKey: "runError",
      queuedCount: runSummary.queuedCount,
      runningCount: runSummary.runningCount,
      failedCount,
      lastError: runSummary.lastError,
    };
  }

  if (runSummary?.status === "queued") {
    return {
      active: true,
      status: "queued",
      labelKey: "pendingQueued",
      queuedCount: runSummary.queuedCount,
      runningCount: runSummary.runningCount,
      failedCount,
      ...activeMeta,
    };
  }

  if (runSummary?.status === "running") {
    const startedAt = activeItem?.startedAt ?? activeItem?.createdAt ?? null;
    const hasServerToolTurn = turns.some((turn) =>
      !isLocalTurn(turn) &&
      turn.role === "tool" &&
      (!startedAt || (turn.createdAt ?? 0) >= startedAt)
    );
    return {
      active: true,
      status: hasServerToolTurn ? "running" : "planning",
      labelKey: hasServerToolTurn ? "pendingGenerating" : "pendingPlanning",
      queuedCount: runSummary.queuedCount,
      runningCount: runSummary.runningCount,
      failedCount,
      ...activeMeta,
    };
  }

  if (localPendingCount > 0) {
    return {
      active: true,
      status: "planning",
      labelKey: "pendingPlanning",
      queuedCount: runSummary?.queuedCount ?? 0,
      runningCount: runSummary?.runningCount ?? 0,
      failedCount,
    };
  }

  return null;
}

function findActiveQueueItem(queueItems: readonly AgentQueueItem[]): AgentQueueItem | null {
  return [...queueItems]
    .filter((item) => item.status === "running" || item.status === "queued")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "running" ? -1 : 1;
      return (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt);
    })[0] ?? null;
}

function getQueueItemProgressMeta(item: AgentQueueItem) {
  return {
    startedAt: item.startedAt ?? null,
    progressStage: item.progressStage ?? null,
    jobKind: item.plan.mode === "video" || item.plan.videoParams ? "video" as const : "image" as const,
    variantCount: item.plan.plannedVariants || item.plan.prompts.length || 1,
  };
}
