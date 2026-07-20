import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const rootDir = process.cwd();

describe("Card News visible text language policy", () => {
  it("requires exact target-language text in planner and generation prompts", async () => {
    const plannerPrompt = await readFile(join(rootDir, "lib", "cardNewsPlannerPrompt.ts"), "utf8");
    const generator = await readFile(join(rootDir, "lib", "cardNewsGenerator.ts"), "utf8");

    assert.match(plannerPrompt, /textFields\[\]\.text must contain the exact words in that language\/script/);
    assert.match(plannerPrompt, /Do not translate, romanize, summarize, or replace visible text/);
    assert.match(generator, /Do not translate, romanize, summarize, substitute, or add unlisted readable text/);
    assert.match(generator, /If visible text is required, it must be listed explicitly in textFields\[\]\.text/);
  });
});
