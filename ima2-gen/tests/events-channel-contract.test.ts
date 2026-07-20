import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { publish, subscribe, replaySince, _resetForTest } from "../lib/eventBus.js";

describe("events channel contract", () => {
  beforeEach(() => _resetForTest());

  it("eventBus delivers events for multiple jobs simultaneously", () => {
    const job1Events: any[] = [];
    const job2Events: any[] = [];

    subscribe((ev) => {
      if (ev.jobId === "job1") job1Events.push(ev);
      if (ev.jobId === "job2") job2Events.push(ev);
    });

    publish("job1", "phase", { requestId: "job1", phase: "streaming" });
    publish("job2", "phase", { requestId: "job2", phase: "streaming" });
    publish("job1", "done", { requestId: "job1", result: "ok" });
    publish("job2", "partial", { requestId: "job2", index: 0 });

    assert.equal(job1Events.length, 2);
    assert.equal(job2Events.length, 2);
    assert.equal(job1Events[1].event, "done");
    assert.equal(job2Events[1].event, "partial");
  });

  it("replaySince recovers missed events after reconnect", () => {
    publish("a", "phase", { requestId: "a" });
    publish("b", "phase", { requestId: "b" });
    publish("a", "done", { requestId: "a" });

    const missed = replaySince(1);
    assert.equal(missed.length, 2);
    assert.equal(missed[0].jobId, "b");
    assert.equal(missed[1].jobId, "a");
    assert.equal(missed[1].event, "done");
  });

  it("events route module exports registerEventsRoute with correct signature", async () => {
    const mod = await import("../routes/events.js");
    assert.equal(typeof mod.registerEventsRoute, "function");
    assert.equal(mod.registerEventsRoute.length, 2);
  });

  it("eventBus publish assigns sequential ids usable as Last-Event-ID", () => {
    publish("x", "phase", {});
    publish("x", "progress", { percent: 50 });
    publish("x", "done", {});

    const afterFirst = replaySince(1);
    assert.equal(afterFirst.length, 2);
    assert.equal(afterFirst[0].event, "progress");
    assert.equal(afterFirst[1].event, "done");
  });
});
