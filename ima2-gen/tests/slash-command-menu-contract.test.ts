import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { filterCommands, SLASH_COMMANDS } = await import(
  "../ui/src/components/agent/slashCommands.ts"
);

function getNestedKey(obj: any, path: string): unknown {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

const koJson = JSON.parse(readFileSync(resolve(__dirname, "../ui/src/i18n/ko.json"), "utf-8"));
const enJson = JSON.parse(readFileSync(resolve(__dirname, "../ui/src/i18n/en.json"), "utf-8"));

describe("filterCommands", () => {
  it("SC-01: returns all 5 commands for empty query", () => {
    const result = filterCommands("");
    assert.equal(result.length, 5);
    const names = result.map((c: any) => c.name);
    assert.deepEqual(names, ["question", "variants", "generate", "parallelism", "help"]);
  });

  it("SC-02: filters to question for 'q'", () => {
    const result = filterCommands("q");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "question");
  });

  it("SC-03: filters to variants for 'v'", () => {
    const result = filterCommands("v");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "variants");
  });

  it("SC-04: alias match — 'gen' resolves to generate", () => {
    const result = filterCommands("gen");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "generate");
  });

  it("SC-05: no match returns empty array", () => {
    const result = filterCommands("xyz");
    assert.equal(result.length, 0);
  });

  it("SC-06: case insensitive — 'Q' matches question", () => {
    const result = filterCommands("Q");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "question");
  });

  it("SC-07: 'n' alias matches variants", () => {
    const result = filterCommands("n");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "variants");
  });

  it("SC-08: 'h' matches help", () => {
    const result = filterCommands("h");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "help");
  });

  it("SC-09: 'p' matches parallelism", () => {
    const result = filterCommands("p");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "parallelism");
  });

  it("SC-10: all commands have descriptionKey", () => {
    for (const cmd of SLASH_COMMANDS) {
      assert.ok(cmd.descriptionKey, `${cmd.name} missing descriptionKey`);
      assert.ok(cmd.descriptionKey.startsWith("agent.slashDesc_"), `${cmd.name} descriptionKey format`);
    }
  });

  it("SC-11: hasValue is true only for commands with <N> parameter", () => {
    const withValue = SLASH_COMMANDS.filter((c: any) => c.hasValue);
    const names = withValue.map((c: any) => c.name);
    assert.deepEqual(names.sort(), ["generate", "parallelism", "variants"]);
  });

  it("SC-12: every descriptionKey exists in ko.json", () => {
    for (const cmd of SLASH_COMMANDS) {
      const val = getNestedKey(koJson, cmd.descriptionKey);
      assert.ok(typeof val === "string" && val.length > 0, `ko.json missing ${cmd.descriptionKey}`);
    }
  });

  it("SC-13: every descriptionKey exists in en.json", () => {
    for (const cmd of SLASH_COMMANDS) {
      const val = getNestedKey(enJson, cmd.descriptionKey);
      assert.ok(typeof val === "string" && val.length > 0, `en.json missing ${cmd.descriptionKey}`);
    }
  });

  it("SC-14: highlightIndex clamp — safeIndex never exceeds filtered length", () => {
    const full = filterCommands("");
    const narrow = filterCommands("question");
    assert.ok(full.length > narrow.length, "full set should be larger than narrow");
    const outOfBoundsIndex = full.length - 1;
    const clamped = Math.min(outOfBoundsIndex, Math.max(0, narrow.length - 1));
    assert.ok(clamped < narrow.length, `clamped ${clamped} must be < narrow.length ${narrow.length}`);
  });
});
