import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildIma2Xmp, buildIma2MetadataPayload, parseIma2Xmp } from "../lib/imageMetadata.ts";

const persistence = readFileSync("ui/src/store/storePersistence.ts", "utf8");
const storeTypes = readFileSync("ui/src/store/storeTypes.ts", "utf8");
const presetStore = readFileSync("ui/src/store/storePresetImpl.ts", "utf8");

describe("preset restore contract", () => {
  it("preserves preset IDs through generation defaults save and restore", () => {
    assert.match(storeTypes, /GenerationDefaults[\s\S]*?presetIds:\s*string\[\]/);
    assert.match(persistence, /Array\.isArray\(parsed\.presetIds\)/);
    assert.match(persistence, /out\.presetIds\s*=/);
    assert.match(presetStore, /saveGenerationDefaultsPatch\(\{ presetIds \}\)/);
    assert.match(presetStore, /selectedPresetIds:\s*loadGenerationDefaults\(\)\.presetIds \?\? \[\]/);
  });

  it("filters unknown preset IDs while restoring", () => {
    assert.match(persistence, /getPresetById/);
    assert.match(persistence, /parsed\.presetIds[\s\S]*?filter\([\s\S]*?getPresetById/);
  });

  it("deduplicates preset IDs while restoring", () => {
    assert.match(persistence, /new Set\(parsed\.presetIds/);
  });

  it("restores an empty preset selection cleanly", () => {
    assert.match(presetStore, /clearPresets:[\s\S]*?persistPresetIds\(\[\]\)[\s\S]*?selectedPresetIds:\s*\[\]/);
  });

  it("round-trips preset IDs through XMP generation metadata", () => {
    const metadata = buildIma2MetadataPayload({
      prompt: "A cinematic city",
      presetIds: ["cinematic", "golden-hour"],
    });

    const restored = parseIma2Xmp(buildIma2Xmp(metadata));
    assert.deepEqual(restored?.presetIds, ["cinematic", "golden-hour"]);
  });
});
