import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveAgentRunProgress } from "../ui/src/components/agent/agentRunProgress.ts";
import type { AgentQueueItem, AgentSessionRunSummary, AgentTurn } from "../ui/src/components/agent/agentTypes.ts";

const baseSummary: AgentSessionRunSummary = {
  status: "idle",
  queuedCount: 0,
  runningCount: 0,
  lastQueueItemId: null,
  lastError: null,
};

function queueItem(status: AgentQueueItem["status"], startedAt: number | null = null): AgentQueueItem {
  return {
    id: "aq_test",
    sessionId: "as_test",
    requestId: "rq_test",
    prompt: "make an image",
    status,
    position: 1,
    resultImageIds: [],
    createdAt: 100,
    startedAt,
    finishedAt: null,
    options: {
      provider: "grok",
      model: "grok-4.3",
      quality: "medium",
      size: "1024x1024",
      format: "png",
      moderation: "low",
      reasoningEffort: "low",
      webSearchEnabled: true,
      generationStrategy: "auto",
      variants: 1,
      maxAutoVariants: 24,
      parallelism: 1,
    },
    plan: {
      mode: "single",
      prompts: ["make an image"],
      requestedVariants: 1,
      plannedVariants: 1,
      plannedParallelism: 1,
      source: "auto-default",
      reason: "test",
      sourceImagePolicy: "none",
    },
  };
}

function turn(role: AgentTurn["role"], createdAt: number, id = `${role}_${createdAt}`): AgentTurn {
  return {
    id,
    role,
    text: role,
    imageIds: [],
    webFindingIds: [],
    status: "complete",
    createdAt,
  };
}

describe("Agent Mode run progress contract", () => {
  it("shows queued progress from durable run summary", () => {
    const progress = deriveAgentRunProgress({
      turns: [],
      queueItems: [queueItem("queued")],
      runSummary: { ...baseSummary, status: "queued", queuedCount: 1 },
      localPendingCount: 0,
    });
    assert.equal(progress?.status, "queued");
    assert.equal(progress?.labelKey, "pendingQueued");
  });

  it("keeps running work in planning until a server tool turn appears", () => {
    const progress = deriveAgentRunProgress({
      turns: [turn("assistant", 150)],
      queueItems: [queueItem("running", 120)],
      runSummary: { ...baseSummary, status: "running", runningCount: 1 },
      localPendingCount: 0,
    });
    assert.equal(progress?.status, "planning");
    assert.equal(progress?.labelKey, "pendingPlanning");
  });

  it("switches to running after a server tool turn appears", () => {
    const progress = deriveAgentRunProgress({
      turns: [turn("assistant", 150), turn("tool", 160)],
      queueItems: [queueItem("running", 120)],
      runSummary: { ...baseSummary, status: "running", runningCount: 1 },
      localPendingCount: 0,
    });
    assert.equal(progress?.status, "running");
    assert.equal(progress?.labelKey, "pendingGenerating");
  });

  it("recovers progress after reload without local pending turns", () => {
    const progress = deriveAgentRunProgress({
      turns: [],
      queueItems: [queueItem("running", 120)],
      runSummary: { ...baseSummary, status: "running", runningCount: 1 },
      localPendingCount: 0,
    });
    assert.equal(progress?.active, true);
    assert.equal(progress?.status, "planning");
  });

  it("uses local pending only as the pre-enqueue bridge", () => {
    const progress = deriveAgentRunProgress({
      turns: [turn("assistant", 100, "agent-local-pending-1")],
      queueItems: [],
      runSummary: { ...baseSummary, status: "idle" },
      localPendingCount: 1,
    });
    assert.equal(progress?.status, "planning");
  });

  it("returns null when idle and reports durable errors", () => {
    assert.equal(deriveAgentRunProgress({
      turns: [],
      queueItems: [],
      runSummary: { ...baseSummary, status: "idle" },
      localPendingCount: 0,
    }), null);

    const error = deriveAgentRunProgress({
      turns: [],
      queueItems: [queueItem("failed")],
      runSummary: { ...baseSummary, status: "error", lastError: "provider failed" },
      localPendingCount: 0,
    });
    assert.equal(error?.status, "error");
    assert.equal(error?.labelKey, "runError");
    assert.equal(error?.lastError, "provider failed");
  });
});
