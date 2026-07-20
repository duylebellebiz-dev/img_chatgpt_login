import type { Express, Request, Response } from "express";
import { existsSync, lstatSync } from "fs";
import { config } from "../config.js";
import { errInfo } from "../lib/errInfo.js";
import { logEvent } from "../lib/logger.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { assertRegularGeneratedPath, resolveInGenerated } from "../lib/assetLifecycle.js";
import {
  assertAssetKind,
  createAsset,
  deleteAsset,
  deleteFolder,
  createFolder,
  listAssets,
  listFolders,
  listTags,
  updateAsset,
  updateFolder,
  clearAllAssets,
} from "../lib/assetsStore.js";

type IdParams = { id: string };

function httpError(status: number, code: string, message: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
 return err;
}

function sendError(res: Response, e: unknown) {
  const status =
    typeof (e as { status?: unknown })?.status === "number"
      ? (e as { status: number }).status
      : 500;
  const code =
    status !== 500 && typeof (e as { code?: unknown })?.code === "string"
      ? (e as { code: string }).code
      : "DB_ERROR";
 res.status(status).json({ error: { code, message: errInfo(e).message } });
}

function queryStr(value: unknown): string | undefined {
 return typeof value === "string" && value !== "" ? value : undefined;
}

async function resolveValidatedFilePath(kind: string, raw: unknown): Promise<string | null> {
  const rel = typeof raw === "string" ? raw.trim() : "";
  if (!rel) {
    if (kind === "image" || kind === "video") {
      throw httpError(400, "INVALID_FILENAME", "filePath required for image/video assets");
    }
    return null;
  }
  const abs = resolveInGenerated(config.storage.generatedDir, rel);
  if (!existsSync(abs) || !lstatSync(abs).isFile()) {
    throw httpError(400, "INVALID_FILENAME", "file does not exist in generated storage");
  }
  await assertRegularGeneratedPath(abs);
 return rel;
}

export function registerAssetsRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  requireRuntimeContext(ctxRaw);

  app.get("/api/assets/folders", (_req: Request, res: Response) => {
    try {
      res.json({ folders: listFolders() });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/assets/folders", (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { name?: unknown; parentId?: unknown };
      const folder = createFolder({ name: body.name, parentId: body.parentId });
      logEvent("assets", "folder-create", { folderId: folder.id });
      res.status(201).json({ folder });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/assets/folders/:id", (req: Request<IdParams>, res: Response) => {
    try {
      const body = (req.body ?? {}) as { name?: unknown; parentId?: unknown };
      const folder = updateFolder(req.params.id, body);
      if (!folder) {
        return res
          .status(404)
          .json({ error: { code: "FOLDER_NOT_FOUND", message: "Folder not found" } });
      }
      res.json({ folder });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/assets/folders/:id", (req: Request<IdParams>, res: Response) => {
    try {
      const ok = deleteFolder(req.params.id);
      if (!ok) {
        return res
          .status(404)
          .json({ error: { code: "FOLDER_NOT_FOUND", message: "Folder not found" } });
      }
      logEvent("assets", "folder-delete", { folderId: req.params.id });
      res.json({ ok: true });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/assets/tags", (_req: Request, res: Response) => {
    try {
      res.json({ tags: listTags() });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/assets", (req: Request, res: Response) => {
    try {
      const limitRaw = queryStr(req.query.limit);
      const result = listAssets({
        kind: queryStr(req.query.kind),
        folderId: queryStr(req.query.folderId),
        tag: queryStr(req.query.tag),
        q: queryStr(req.query.q),
        cursor: queryStr(req.query.cursor),
        limit: limitRaw ? Number(limitRaw) : undefined,
      });
      res.json(result);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/assets", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        kind?: unknown;
        name?: unknown;
        filePath?: unknown;
        folderId?: unknown;
        notes?: unknown;
        metadata?: unknown;
        tags?: unknown;
      };
      const kind = assertAssetKind(body.kind);
      const filePath = await resolveValidatedFilePath(kind, body.filePath);
      const asset = createAsset({
        kind,
        name: body.name,
        filePath,
        folderId: body.folderId,
        notes: body.notes,
        metadata: body.metadata,
        tags: body.tags,
      });
      logEvent("assets", "create", { assetId: asset.id, kind: asset.kind });
      res.status(201).json({ asset });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/assets/:id", (req: Request<IdParams>, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        name?: unknown;
        folderId?: unknown;
        notes?: unknown;
        tags?: unknown;
        metadata?: unknown;
      };
      const asset = updateAsset(req.params.id, body);
      if (!asset) {
        return res
          .status(404)
          .json({ error: { code: "ASSET_NOT_FOUND", message: "Asset not found" } });
      }
      res.json({ asset });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/assets/:id", (req: Request<IdParams>, res: Response) => {
    try {
      const ok = deleteAsset(req.params.id);
      if (!ok) {
        return res
          .status(404)
          .json({ error: { code: "ASSET_NOT_FOUND", message: "Asset not found" } });
      }
      logEvent("assets", "delete", { assetId: req.params.id });
      res.json({ ok: true });
    } catch (e) {
      sendError(res, e);
    }
 });

  app.delete("/api/assets/all", (_req: Request, res: Response) => {
    try {
      const count = clearAllAssets();
      logEvent("assets", "clear_all", { deletedCount: count });
      res.json({ ok: true, deletedCount: count });
    } catch (e) {
      sendError(res, e);
    }
  });
}
