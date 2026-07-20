import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { publish, subscribe, replaySince, RING_SIZE, _resetForTest } from "../lib/eventBus.js";

describe("eventBus", () => {
  beforeEach(() => _resetForTest());

  it("delivers events to subscribers", () => {
    const received: any[] = [];
    subscribe((ev) => received.push(ev));
    publish("job1", "phase", { phase: "streaming", requestId: "job1" });
    assert.equal(received.length, 1);
    assert.equal(received[0].jobId, "job1");
    assert.equal(received[0].event, "phase");
    assert.equal(received[0].id, 1);
  });

  it("assigns monotonically increasing ids", () => {
    const ids: number[] = [];
    subscribe((ev) => ids.push(ev.id));
    publish("a", "phase", {});
    publish("b", "done", {});
    publish("c", "error", {});
    assert.deepEqual(ids, [1, 2, 3]);
  });

  it("unsubscribe stops delivery", () => {
    const received: any[] = [];
    const unsub = subscribe((ev) => received.push(ev));
    publish("j1", "phase", {});
    unsub();
    publish("j2", "done", {});
    assert.equal(received.length, 1);
  });

  it("replaySince returns events after given id", () => {
    publish("a", "phase", { requestId: "a" });
    publish("b", "done", { requestId: "b" });
    publish("c", "error", { requestId: "c" });
    const replayed = replaySince(1);
    assert.equal(replayed.length, 2);
    assert.equal(replayed[0].jobId, "b");
    assert.equal(replayed[1].jobId, "c");
  });

  it("replaySince returns empty for unknown id", () => {
    publish("a", "phase", {});
    const replayed = replaySince(999);
    assert.deepEqual(replayed, []);
  });

  it("ring buffer caps at RING_SIZE", () => {
    for (let i = 0; i < RING_SIZE + 100; i++) {
      publish(`job${i}`, "phase", {});
    }
    const all = replaySince(0);
    assert.equal(all.length, RING_SIZE);
    assert.equal(all[0].id, 101);
  });

  it("stores stripped metadata for large image events in ring buffer", () => {
    const largeImage = "data:image/png;base64," + "A".repeat(2000);
    publish("img1", "partial", { image: largeImage, requestId: "img1", index: 0 });
    publish("img1", "done", { image: largeImage, requestId: "img1", filename: "out.png", url: "/generated/out.png" });
    const replayed = replaySince(0);
    assert.equal(replayed.length, 2);
    assert.equal(replayed[0].event, "partial");
    assert.equal((replayed[0].data as { _imageOmitted?: boolean })._imageOmitted, true);
    assert.equal(replayed[1].event, "done");
    assert.equal((replayed[1].data as { filename?: string }).filename, "out.png");
    assert.equal((replayed[1].data as { _imageOmitted?: boolean })._imageOmitted, true);
  });

  it("strips nested classic multi-image payloads from the replay ring", () => {
    const largeImage = "data:image/png;base64," + "A".repeat(2000);
    publish("classic1", "done", {
      requestId: "classic1",
      images: [
        { image: largeImage, filename: "a.png" },
        { image: largeImage, filename: "b.png" },
      ],
    });

    const [replayed] = replaySince(0);
    const data = replayed.data as { images?: Array<{ image?: string; filename?: string; _imageOmitted?: boolean }>; _imageOmitted?: boolean };
    assert.equal(data._imageOmitted, true);
    assert.equal(data.images?.[0]?.filename, "a.png");
    assert.equal(data.images?.[0]?.image, undefined);
    assert.equal(data.images?.[0]?._imageOmitted, true);
    assert.equal(data.images?.[1]?.filename, "b.png");
    assert.equal(data.images?.[1]?.image, undefined);
  });

  it("still delivers large image events to live subscribers", () => {
    const received: any[] = [];
    subscribe((ev) => received.push(ev));
    const largeImage = "data:image/png;base64," + "A".repeat(2000);
    publish("img1", "partial", { image: largeImage, requestId: "img1" });
    assert.equal(received.length, 1);
    assert.equal(received[0].event, "partial");
  });
});
