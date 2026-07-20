import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AGENT_GENERATION_SETTINGS, normalizeAgentGenerationSettings } from "../lib/agentSettings.ts";
import { parseAgentSlashCommand } from "../lib/agentCommandParser.ts";
import { deriveAgentGenerationPlan, normalizeAgentGenerationPlan } from "../lib/agentGenerationPlanner.ts";

describe("Agent Mode auto generation planner contract", () => {
  it("normalizes Agent generation settings against the configured 24-count limits", () => {
    const settings = normalizeAgentGenerationSettings({
      variants: 24,
      maxAutoVariants: 24,
      parallelism: 24,
    });

    assert.equal(settings.variants, 24);
    assert.equal(settings.maxAutoVariants, 24);
    assert.equal(settings.parallelism, 24);
    assert.equal(DEFAULT_AGENT_GENERATION_SETTINGS.maxAutoVariants, 24);
  });

  it("defaults to one image while allowing the prompt to request bounded fanout", () => {
    const single = deriveAgentGenerationPlan({
      prompt: "make a quiet editorial poster",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(single.mode, "single");
    assert.equal(single.plannedVariants, 1);
    assert.equal(single.plannedParallelism, 1);
    assert.equal(single.source, "auto-default");
    assert.equal(single.sourceImagePolicy, "none");

    const fanout = deriveAgentGenerationPlan({
      prompt: "make three distinct poster variants",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(fanout.mode, "fanout");
    assert.equal(fanout.requestedVariants, 3);
    assert.equal(fanout.plannedVariants, 3);
    assert.equal(fanout.plannedParallelism, 2);
    assert.equal(fanout.source, "auto-request");
    assert.equal(fanout.sourceImagePolicy, "none");
  });

  it("distinguishes fresh image requests from current-image reference requests", () => {
    const fresh = deriveAgentGenerationPlan({
      prompt: "i2i 말고 새로운 방식으로 개꼴리는 비키니입은 한국여성",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(fresh.mode, "single");
    assert.equal(fresh.sourceImagePolicy, "none");

    const separate = deriveAgentGenerationPlan({
      prompt: "새로 별도 이미지 하나 생성",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(separate.sourceImagePolicy, "none");

    const current = deriveAgentGenerationPlan({
      prompt: "이 이미지 스타일 유지해서 다시 만들어줘",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(current.sourceImagePolicy, "current");

    const video = deriveAgentGenerationPlan({
      prompt: "방금 그 이미지를 10초 16:9 영상으로 만들어줘",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(video.mode, "video");
    assert.equal(video.sourceImagePolicy, "auto");
  });

  it("infers source image policy for persisted plans missing the field", () => {
    const plain = normalizeAgentGenerationPlan(
      "make a quiet editorial poster",
      { mode: "single", prompts: ["make a quiet editorial poster"], plannedVariants: 1, plannedParallelism: 1 },
      DEFAULT_AGENT_GENERATION_SETTINGS,
    );
    assert.equal(plain.sourceImagePolicy, "none");

    const current = normalizeAgentGenerationPlan(
      "이 이미지 스타일 유지해서 다시 만들어줘",
      { mode: "single", prompts: ["이 이미지 스타일 유지해서 다시 만들어줘"], plannedVariants: 1, plannedParallelism: 1 },
      DEFAULT_AGENT_GENERATION_SETTINGS,
    );
    assert.equal(current.sourceImagePolicy, "current");
  });

  it("infers numeric Agent fanout requests up to the configured image limit", () => {
    const twelve = deriveAgentGenerationPlan({
      prompt: "make 12 image variants",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 24 },
    });
    assert.equal(twelve.requestedVariants, 12);
    assert.equal(twelve.plannedVariants, 12);
    assert.equal(twelve.plannedParallelism, 12);
    assert.equal(twelve.source, "auto-request");

    const twentyFour = deriveAgentGenerationPlan({
      prompt: "make twenty-four image variants",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 24 },
    });
    assert.equal(twentyFour.requestedVariants, 24);
    assert.equal(twentyFour.plannedVariants, 24);
    assert.equal(twentyFour.plannedParallelism, 24);

    const korean = deriveAgentGenerationPlan({
      prompt: "스물네 가지 시안 만들어줘",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 24 },
    });
    assert.equal(korean.requestedVariants, 24);
    assert.equal(korean.plannedVariants, 24);
  });

  it("lets slash commands override variant count and per-turn parallelism", () => {
    const variants = parseAgentSlashCommand("/variants 4 neon product shot");
    assert.equal(variants?.name, "variants");
    assert.equal(variants?.value, 4);
    assert.equal(variants?.prompt, "neon product shot");

    const plan = deriveAgentGenerationPlan({
      prompt: variants?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 8 },
      command: variants,
    });
    assert.equal(plan.mode, "fanout");
    assert.equal(plan.plannedVariants, 4);
    assert.equal(plan.plannedParallelism, 4);
    assert.equal(plan.source, "slash-command");

    const parallel = parseAgentSlashCommand("/parallelism 1 make three options");
    const capped = deriveAgentGenerationPlan({
      prompt: parallel?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 8 },
      command: parallel,
    });
    assert.equal(capped.plannedVariants, 3);
    assert.equal(capped.plannedParallelism, 1);

    const noCount = parseAgentSlashCommand("/variants neon product shot");
    const noCountPlan = deriveAgentGenerationPlan({
      prompt: noCount?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api" },
      command: noCount,
    });
    assert.equal(noCountPlan.plannedVariants, 3);

    const overLimit = parseAgentSlashCommand("/generate 25 neon product shot");
    assert.equal(overLimit?.value, 24);
  });

  it("keeps manual settings as an explicit fixed-count mode", () => {
    const plan = deriveAgentGenerationPlan({
      prompt: "make a poster",
      settings: {
        ...DEFAULT_AGENT_GENERATION_SETTINGS,
        generationStrategy: "manual",
        variants: 5,
        provider: "api",
        parallelism: 3,
      },
    });
    assert.equal(plan.mode, "fanout");
    assert.equal(plan.plannedVariants, 5);
    assert.equal(plan.plannedParallelism, 3);
    assert.equal(plan.source, "manual-settings");
  });
});
