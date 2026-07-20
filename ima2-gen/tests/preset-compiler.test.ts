import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compilePresets,
  type PresetDefinition,
  type PresetProvider,
} from "../lib/presetCompiler.ts";
import { buildIma2MetadataPayload, buildIma2Xmp, parseIma2Xmp } from "../lib/imageMetadata.ts";

const catalog: PresetDefinition[] = [
  {
    id: "camera",
    name: "Camera",
    category: "camera-motion",
    promptFragment: "default camera",
    perProvider: {
      grok: { fragment: "camera: grok orbit", params: { strength: 1, camera: true } },
      gemini: { fragment: "gemini camera" },
    },
    modes: ["video"],
  },
  {
    id: "style",
    name: "Style",
    category: "style",
    promptFragment: "default style",
    perProvider: {
      gpt: { params: { strength: 2, style: true } },
      grok: { fragment: "grok style", params: { strength: 3, style: true } },
      gemini: { fragment: "gemini style" },
    },
    modes: ["both"],
  },
  {
    id: "lighting",
    name: "Lighting",
    category: "lighting",
    promptFragment: "default lighting",
    perProvider: {
      grok: { fragment: "grok lighting" },
      gemini: { fragment: "gemini lighting" },
    },
    modes: ["both"],
  },
];

describe("compilePresets", () => {
  it("concatenates fragments", () => {
    const result = compilePresets({ catalog, presetIds: ["style", "lighting"], provider: "gpt", mode: "image" });
    assert.equal(result.promptFragment, "default style default lighting");
  });

  it("uses the provider fragment instead of the default", () => {
    const result = compilePresets({ catalog, presetIds: ["style"], provider: "grok", mode: "image" });
    assert.equal(result.promptFragment, "grok style");
  });

  it("shallow-merges params with later presets taking precedence", () => {
    const result = compilePresets({ catalog, presetIds: ["camera", "style"], provider: "grok", mode: "video" });
    assert.deepEqual(result.params, { strength: 3, camera: true, style: true });
  });

  it("skips presets that do not support the requested mode", () => {
    const result = compilePresets({ catalog, presetIds: ["camera", "style"], provider: "gpt", mode: "image" });
    assert.deepEqual(result.appliedPresetIds, ["style"]);
    assert.deepEqual(result.skipped, ["camera"]);
  });

  it("records unknown IDs as skipped", () => {
    const result = compilePresets({ catalog, presetIds: ["missing", "style"], provider: "gpt", mode: "image" });
    assert.deepEqual(result.appliedPresetIds, ["style"]);
    assert.deepEqual(result.skipped, ["missing"]);
  });

  it("preserves selection order", () => {
    const result = compilePresets({ catalog, presetIds: ["lighting", "style"], provider: "gpt", mode: "image" });
    assert.equal(result.promptFragment, "default lighting default style");
    assert.deepEqual(result.appliedPresetIds, ["lighting", "style"]);
  });

  it("returns empty output for no selected presets", () => {
    const result = compilePresets({ catalog, presetIds: [], provider: "gpt", mode: "image" });
    assert.deepEqual(result, { promptFragment: "", params: {}, appliedPresetIds: [], skipped: [] });
  });

  it("matches the three-preset provider snapshot", () => {
    const providers: PresetProvider[] = ["gpt", "grok", "gemini"];
    const snapshot = providers.flatMap((provider) => catalog.map((preset) => {
      const result = compilePresets({
        catalog,
        presetIds: [preset.id],
        provider,
        mode: "video",
      });
      return {
        provider,
        presetId: preset.id,
        fragment: result.promptFragment,
      };
    }));

    assert.deepEqual(snapshot, [
      { provider: "gpt", presetId: "camera", fragment: "default camera" },
      { provider: "gpt", presetId: "style", fragment: "default style" },
      { provider: "gpt", presetId: "lighting", fragment: "default lighting" },
      { provider: "grok", presetId: "camera", fragment: "camera: grok orbit" },
      { provider: "grok", presetId: "style", fragment: "grok style" },
      { provider: "grok", presetId: "lighting", fragment: "grok lighting" },
      { provider: "gemini", presetId: "camera", fragment: "gemini camera" },
      { provider: "gemini", presetId: "style", fragment: "gemini style" },
      { provider: "gemini", presetId: "lighting", fragment: "gemini lighting" },
    ]);
  });

  it("preserves preset IDs through the XMP payload round-trip", () => {
    const payload = buildIma2MetadataPayload({ prompt: "test", presetIds: ["style", 1, "lighting", "style"] });
    const parsed = parseIma2Xmp(buildIma2Xmp(payload));
    assert.deepEqual(parsed?.presetIds, ["style", "lighting"]);
  });
});
