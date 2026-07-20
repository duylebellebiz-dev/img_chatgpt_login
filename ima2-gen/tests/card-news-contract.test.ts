import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import express from "express";
import { listImageTemplates, getImageTemplate } from "../lib/cardNewsTemplateStore.ts";
import { createCardNewsDraft } from "../lib/cardNewsPlanner.ts";
import { repairPlannerOutput, validatePlannerOutput } from "../lib/cardNewsPlannerSchema.ts";

const rootDir = process.cwd();

type CardLike = {
  id?: string;
  role?: string;
  status?: string;
  url?: string;
  textFields?: unknown[];
  visualPrompt?: string;
  locked?: boolean;
  [key: string]: unknown;
};
type AnyDraft = {
  setId?: string;
  generationStrategy?: string;
  cards?: CardLike[];
  plan?: { cards: CardLike[]; setId?: string; generationStrategy?: string; [k: string]: unknown };
  planner?: { mode: string; model: unknown; repaired: boolean };
  [key: string]: unknown;
};
const asDraft = (d: unknown): AnyDraft => d as AnyDraft;

function readPngSize(buf) {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

type CtxLike = {
  rootDir: string;
  oauthUrl?: string;
  config: {
    features: { cardNews: boolean };
    storage: { generatedDir: string; staticMaxAge: string };
    server: { bodyLimit: string };
    oauth: { validModeration: Set<string> };
    imageModels: { default: string };
    cardNewsPlanner: { enabled: boolean; model: string; timeoutMs: number; deterministicFallback: boolean };
  };
};

function makeCtx(generatedDir, cardNews = true): CtxLike {
  return {
    rootDir,
    config: {
      features: { cardNews },
      storage: { generatedDir, staticMaxAge: "0" },
      server: { bodyLimit: "2mb" },
      oauth: { validModeration: new Set(["auto", "low"]) },
      imageModels: { default: "gpt-5.4-mini" },
      cardNewsPlanner: { enabled: false, model: "gpt-5.4-mini", timeoutMs: 60_000, deterministicFallback: false },
    },
  };
}

async function listen(app) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as import("node:net").AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function listenPlanner(handler) {
  const app = express();
  app.use(express.json());
  app.post("/v1/responses", handler);
  return listen(app);
}

describe("Card News 0.20 dev MVP contract", () => {
  it("keeps the planner text-only and returns planner metadata", async () => {
    const promptSource = await readFile(join(rootDir, "lib", "cardNewsPlannerPrompt.ts"), "utf8");
    const clientSource = await readFile(join(rootDir, "lib", "cardNewsPlannerClient.ts"), "utf8");
    const schemaSource = await readFile(join(rootDir, "lib", "cardNewsPlannerSchema.ts"), "utf8");
    const draft = asDraft(await createCardNewsDraft(makeCtx("/tmp/ima2-card-news-planner"), {
      topic: "JSON output",
      roleTemplateId: "short-3",
      imageTemplateId: "academy-lesson-square",
    }));

    assert.doesNotMatch(promptSource, /image_generation/);
    assert.match(promptSource, /JSON/);
    assert.match(promptSource, /Role names such as cover\/problem\/cta are structural labels/);
    assert.match(promptSource, /Use headline textFields for hook\/cover cards/);
    assert.match(promptSource, /Placement examples:/);
    assert.match(promptSource, /preferredSlots/);
    assert.match(promptSource, /textFieldPolicy/);
    assert.match(clientSource, /json_schema/);
    assert.match(clientSource, /json_object/);
    assert.match(clientSource, /\/v1\/chat\/completions/);
    assert.match(schemaSource, /validatePlannerOutput/);
    assert.match(schemaSource, /textFields/);
    assert.match(schemaSource, /slotId/);
    assert.match(schemaSource, /maxChars/);
    assert.match(schemaSource, /language/);
    assert.equal(draft.planner.mode, "deterministic-fallback");
    assert.equal(draft.plan.cards.length, 3);
    assert.deepEqual(draft.plan.cards[0].textFields, []);
  });

  it("keeps visible copy in textFields and out of visualPrompt", () => {
    const roleTemplate = {
      roles: [{ role: "cover", promptHint: "cover", preferredSlots: ["title"] }],
    };
    const visibleText = "중간고사 역전 플랜";
    const output = {
      title: "중간고사",
      topic: "중간고사",
      cards: [{
        order: 1,
        role: "cover",
        headline: "중간고사",
        body: "요약",
        visualPrompt: `top headline should render ${visibleText}`,
        textFields: [{
          id: "tf_1",
          kind: "headline",
          text: visibleText,
          renderMode: "in-image",
          placement: "top-center",
          slotId: "title",
          hierarchy: "primary",
          maxChars: 24,
          language: "ko",
          source: "planner",
        }],
        references: [],
        locked: false,
      }],
    };

    const invalid = validatePlannerOutput(output, roleTemplate);
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.some((error) => error.includes("visualPrompt must not duplicate exact visible text")));

    const repaired = repairPlannerOutput(output, {
      topic: "중간고사",
      contentBrief: "학부모 대상 안내",
      roleTemplate,
    });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.plan.cards[0].textFields[0].text, visibleText);
    assert.doesNotMatch(repaired.plan.cards[0].visualPrompt, new RegExp(visibleText));
  });

  it("honors planner upstream failure and deterministic fallback config", async () => {
    const upstream = await listenPlanner((_req, res) => {
      res.status(500).json({ error: { message: "planner down" } });
    });
    const ctx = makeCtx("/tmp/ima2-card-news-planner-fail");
    ctx.oauthUrl = upstream.baseUrl;
    ctx.config.cardNewsPlanner = {
      enabled: true,
      model: "gpt-5.4-mini",
      timeoutMs: 5_000,
      deterministicFallback: false,
    };

    try {
      await assert.rejects(
        () => createCardNewsDraft(ctx, {
          topic: "fail",
          roleTemplateId: "short-3",
          imageTemplateId: "academy-lesson-square",
        }),
        (err) => (err as { code?: string }).code === "PLANNER_UPSTREAM_FAILED",
      );

      ctx.config.cardNewsPlanner.deterministicFallback = true;
      const draft = asDraft(await createCardNewsDraft(ctx, {
        topic: "fallback",
        roleTemplateId: "short-3",
        imageTemplateId: "academy-lesson-square",
      }));
      assert.equal(draft.planner.mode, "deterministic-fallback");
      assert.equal(draft.plan.cards.length, 3);
    } finally {
      await upstream.close();
    }
  });

  it("rejects invalid planner JSON when fallback is disabled", async () => {
    const upstream = await listenPlanner((_req, res) => {
      res.json({ output_text: "not json" });
    });
    const ctx = makeCtx("/tmp/ima2-card-news-planner-json");
    ctx.oauthUrl = upstream.baseUrl;
    ctx.config.cardNewsPlanner = {
      enabled: true,
      model: "gpt-5.4-mini",
      timeoutMs: 5_000,
      deterministicFallback: false,
    };

    try {
      await assert.rejects(
        () => createCardNewsDraft(ctx, {
          topic: "invalid json",
          roleTemplateId: "short-3",
          imageTemplateId: "academy-lesson-square",
        }),
        (err) => (err as { code?: string }).code === "PLANNER_INVALID_JSON",
      );
    } finally {
      await upstream.close();
    }
  });

  it("lists built-in image templates and rejects unsafe template ids", async () => {
    const ctx = makeCtx("/tmp/ima2-card-news-contract");
    const templates = await listImageTemplates(ctx);

    assert.ok(templates.some((t) => t.id === "academy-lesson-square"));
    assert.ok(templates.some((t) => t.id === "clean-report-square"));
    assert.equal(templates[0].previewUrl.startsWith("/api/cardnews/image-templates/"), true);

    for (const id of ["academy-lesson-square", "clean-report-square"]) {
      const template = templates.find((item) => item.id === id);
      assert.deepEqual(template.recommendedOutputSizes, ["1024x1024", "2048x2048"]);
      assert.equal(typeof template.authoringLabel, "string");
      assert.equal(typeof template.description, "string");
      assert.ok(template.slots.every((slot) => slot.label && slot.placement));
      assert.ok(template.slots.every((slot) => slot.kind !== "title" && slot.kind !== "body" && slot.kind !== "cta"));
      assert.ok(template.slots.filter((slot) => slot.kind === "text").every((slot) => Number.isInteger(slot.maxChars)));
      const base = await readFile(join(rootDir, "assets", "card-news", "templates", id, "base.png"));
      const preview = await readFile(join(rootDir, "assets", "card-news", "templates", id, "preview.png"));
      assert.deepEqual(readPngSize(base), { width: 1024, height: 1024 });
      assert.deepEqual(readPngSize(preview), { width: 1024, height: 1024 });
    }

    await assert.rejects(
      () => getImageTemplate(ctx, "../escape"),
      (err) => (err as { code?: string }).code === "CARD_NEWS_BAD_TEMPLATE_ID",
    );
  });
});
