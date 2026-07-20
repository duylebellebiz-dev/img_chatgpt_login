import type { Express, Request, Response } from "express";
import { errInfo } from "../lib/errInfo.js";
import { logError } from "../lib/logger.js";
import { requestPromptBuilderChat } from "../lib/promptBuilder/client.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerPromptBuilderRoutes(
  app: Express,
  ctxRaw: RouteRuntimeContext,
) {
  const ctx = requireRuntimeContext(ctxRaw);

  app.post(
    "/api/prompt-builder/chat",
    async (req: Request, res: Response) => {
      try {
        const result = await requestPromptBuilderChat(ctx, req.body);
        res.json(result);
      } catch (error) {
        const info = errInfo(error);
        const code =
          typeof info.code === "string" ? info.code : "PROMPT_BUILDER_UNKNOWN";
        const status =
          typeof info.status === "number" && info.status >= 400
            ? info.status
            : 500;
        logError("prompt-builder", code, {
          message: info.message,
          status,
        });
        res.status(status).json({
          error: { code, message: info.message },
        });
      }
    },
  );
}
