import type { AssetFolder, AssetItem, AssetsFilters } from "../store/storeTypes";
import { jsonFetch } from "./api-core";

export type AssetsPage = { assets: AssetItem[]; nextCursor: string | null };
export type AssetUpdatePatch = {
  name?: string;
  folderId?: string | null;
  notes?: string;
  tags?: string[];
};

export function getAssets(input: AssetsFilters & { cursor?: string | null; limit?: number }): Promise<AssetsPage> {
  const params = new URLSearchParams();
  if (input.kind) params.set("kind", input.kind);
  if (input.folderId) params.set("folderId", input.folderId);
  if (input.tag) params.set("tag", input.tag);
  if (input.q) params.set("q", input.q);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return jsonFetch<AssetsPage>(`/api/assets${query ? `?${query}` : ""}`);
}

export function createAsset(input: {
  filePath: string;
  kind: AssetItem["kind"];
  name?: string;
  folderId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<{ asset: AssetItem }> {
  return jsonFetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function updateAsset(id: string, patch: AssetUpdatePatch): Promise<{ asset: AssetItem }> {
  return jsonFetch(`/api/assets/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
}

export function deleteAsset(id: string): Promise<{ ok: true }> {
  return jsonFetch(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getAssetFolders(): Promise<{ folders: AssetFolder[] }> {
  return jsonFetch("/api/assets/folders");
}

export function createAssetFolder(input: { name: string; parentId?: string | null }): Promise<{ folder: AssetFolder }> {
  return jsonFetch("/api/assets/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function updateAssetFolder(id: string, patch: { name?: string; parentId?: string | null }): Promise<{ folder: AssetFolder }> {
  return jsonFetch(`/api/assets/folders/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
}

export function deleteAssetFolder(id: string): Promise<{ ok: true }> {
  return jsonFetch(`/api/assets/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getAssetTags(): Promise<{ tags: string[] }> {
  return jsonFetch("/api/assets/tags");
}

export function clearAllAssets(): Promise<{ ok: true; deletedCount: number }> {
  return jsonFetch("/api/assets/all", { method: "DELETE" });
}
