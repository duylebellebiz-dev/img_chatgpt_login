import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = mkdtempSync(join(tmpdir(), "ima2-agent-queue-store-"));
process.env.IMA2_CONFIG_DIR = testDir;
process.env.IMA2_DB_PATH = join(testDir, "sessions.db");

const db = await import("../lib/db.ts");
const { createAgentSession, getAgentWorkspacePayload } = await import("../lib/agentStore.ts");
const {
  claimNextAgentQueueItem,
  completeAgentQueueItem,
  createAgentQueueItem,
  failAgentQueueItem,
  getAgentQueueItem,
  recoverRunningAgentQueueItems,
  retryAgentQueueItem,
  updateAgentQueueItemProgress,
} = await import("../lib/agentQueueStore.ts");

const limits = { maxGlobalRunning: 2, maxSessionRunning: 1 };

after(() => {
  db.closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("Agent queue persistence contracts", () => {
  it("projects startedAt and progressStage, then recovers stale running work as retryable", () => {
    const session = createAgentSession({ title: "recovery" });
    const queued = createAgentQueueItem({ sessionId: session.id, prompt: "recover me" });
    const running = claimNextAgentQueueItem(limits);

    assert.equal(running?.id, queued.id);
    assert.equal(typeof running?.startedAt, "number");
    assert.equal(updateAgentQueueItemProgress(queued.id, "polling"), true);

    const projected = getAgentWorkspacePayload(session.id).queueBySession[session.id][0];
    assert.equal(projected.startedAt, running?.startedAt);
    assert.equal(projected.progressStage, "polling");

    assert.equal(recoverRunningAgentQueueItems(), 1);
    const recovered = getAgentQueueItem(queued.id);
    assert.equal(recovered?.status, "failed");
    assert.equal(recovered?.errorMessage, "server restarted mid-run");
    assert.equal(recovered?.progressStage, null);
    assert.equal(retryAgentQueueItem(queued.id), true);
    assert.equal(getAgentQueueItem(queued.id)?.status, "queued");
    claimNextAgentQueueItem(limits);
    completeAgentQueueItem(queued.id, []);
  });

  it("summarizes idle state from the most recent terminal event", () => {
    const session = createAgentSession({ title: "terminal ordering" });
    const failed = createAgentQueueItem({ sessionId: session.id, prompt: "older failure" });
    claimNextAgentQueueItem(limits);
    failAgentQueueItem(failed.id, { code: "older", message: "older failure" });
    db.getDb().prepare("UPDATE agent_queue_items SET finished_at = ? WHERE id = ?").run(100, failed.id);

    const succeeded = createAgentQueueItem({ sessionId: session.id, prompt: "newer success" });
    claimNextAgentQueueItem(limits);
    completeAgentQueueItem(succeeded.id, []);
    db.getDb().prepare("UPDATE agent_queue_items SET finished_at = ? WHERE id = ?").run(200, succeeded.id);

    const summary = getAgentWorkspacePayload(session.id).runSummaryBySession[session.id];
    assert.equal(summary.status, "idle");
    assert.equal(summary.lastError, null);
  });
});
