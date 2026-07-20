import type { Express } from "express";
import { runGeneratePipeline } from "../lib/generatePipeline.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { normalizePresetIds } from "../lib/presetCompiler.js";

export function registerGenerateRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/generate", (req, res) => {
    req.body = { ...req.body, presetIds: normalizePresetIds(req.body?.presetIds) };
    return runGeneratePipeline(req, res, ctx);
  });
}
