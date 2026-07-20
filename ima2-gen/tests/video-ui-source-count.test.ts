import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEffectiveVideoSourceCount } from "../ui/src/lib/videoSourceCount.ts";

function count(overrides: Record<string, unknown>): number {
  return getEffectiveVideoSourceCount({
    uiMode: "classic",
    referenceImages: [],
    providerUrlReference: null,
    graphNodes: [],
    graphEdges: [],
    ...overrides,
  });
}

describe("video UI source count", () => {
  it("matches the effective source surfaces submitted by video generation", () => {
    assert.equal(count({ referenceImages: [] }), 0);
    assert.equal(count({ referenceImages: ["data:image/png;base64,A"] }), 1);
    assert.equal(count({ referenceImages: ["A", "B"] }), 2);
    assert.equal(count({ providerUrlReference: "https://example.test/source.png", referenceImages: ["A", "B"] }), 1);

    const selectedChild = { id: "child", selected: true, data: { referenceImages: [] } };
    assert.equal(count({
      uiMode: "node",
      graphNodes: [
        { id: "parent", data: { serverNodeId: "srv-parent", imageUrl: "/generated/parent.png" } },
        { ...selectedChild, data: { ...selectedChild.data, parentServerNodeId: "srv-parent" } },
      ],
      graphEdges: [],
    }), 1);

    assert.equal(count({
      uiMode: "node",
      graphNodes: [
        { id: "parent", data: { imageUrl: "/generated/parent.mp4" } },
        selectedChild,
      ],
      graphEdges: [{ source: "parent", target: "child" }],
    }), 1);

    assert.equal(count({
      uiMode: "node",
      graphNodes: [{ id: "child", selected: true, data: { referenceImages: ["A", "B"] } }],
      graphEdges: [],
    }), 2);
  });
});
