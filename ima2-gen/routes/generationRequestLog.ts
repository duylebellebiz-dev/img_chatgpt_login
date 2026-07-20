import type { Express, Request, Response } from "express";
import { listGenerationRequestLog } from "../lib/generationRequestLog.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerGenerationRequestLogRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);

  app.get("/api/generation-requests", async (_req: Request, res: Response) => {
    try {
      const items = await listGenerationRequestLog(ctx.config.storage.generationRequestLogFile);
      res.json({ items });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Could not read generation request log",
      });
    }
  });
}
