import type { Express, Request, Response } from "express";
import { loadNodeMeta } from "../lib/nodeStore.js";
import { errInfo } from "../lib/errInfo.js";
import { runNodeGeneration } from "../lib/nodeGeneration.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerNodeRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/node/generate", (req, res) => runNodeGeneration(req, res, ctx));
  app.get("/api/node/:nodeId", async (req: Request<{ nodeId: string }>, res: Response) => {
    try {
      const { nodeId } = req.params;
      const meta = await loadNodeMeta(ctx.rootDir, nodeId, "png", ctx.config.storage.generatedDir);
      if (!meta) {
        return res.status(404).json({ error: { code: "NODE_NOT_FOUND", message: "Node metadata missing" } });
      }
      const ext = meta?.options?.format || meta?.format || "png";
      res.json({ nodeId, meta, url: `/generated/${nodeId}.${ext}` });
    } catch (e) {
      const err = errInfo(e);
      res.status(err.status || 500).json({
        error: { code: err.code || "NODE_FETCH_FAILED", message: err.message },
      });
    }
  });
}

