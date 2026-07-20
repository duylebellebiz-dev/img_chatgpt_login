import type { Express } from "express";
import { runMultimodePipeline } from "../lib/multimodePipeline.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerMultimodeRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/generate/multimode", (req, res) => runMultimodePipeline(req, res, ctx));
}

