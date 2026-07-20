import type { GenerateItem } from "../types";
import { createAsset, createAssetFolder, deleteAsset, deleteAssetFolder, getAssetFolders, getAssets, getAssetTags, updateAsset, updateAssetFolder } from "../lib/api-assets";
import { isVideoItem } from "../lib/videoMedia";
import type { AssetUpdatePatch } from "../lib/api-assets";
import type { AssetsFilters, StoreGet, StoreSet } from "./storeTypes";

const logError = (error: unknown) => console.error("[assets]", error instanceof Error ? error.message : String(error));

/** Monotonic request generation: a newer load (filter reset) invalidates any
 *  in-flight response so stale results never overwrite current filters. */
let assetsRequestGeneration = 0;

async function refreshFolders(set: StoreSet): Promise<void> {
  const { folders } = await getAssetFolders();
  set({ assetsFolders: folders });
}

export async function loadAssetsImpl(reset: boolean | undefined, set: StoreSet, get: StoreGet): Promise<void> {
  const replace = reset !== false;
  if (!replace && get().assetsLoading) return;
  const generation = ++assetsRequestGeneration;
  set({ assetsLoading: true });
  try {
    const filters = get().assetsFilters;
    const page = await getAssets({ ...filters, cursor: replace ? null : get().assetsCursor });
    const extras = replace ? await Promise.all([getAssetFolders(), getAssetTags()]) : null;
    if (generation !== assetsRequestGeneration) return;
    set((state) => ({
      assets: replace ? page.assets : [...state.assets, ...page.assets.filter((item) => !state.assets.some((current) => current.id === item.id))],
      assetsCursor: page.nextCursor,
      assetsLoading: false,
      ...(extras ? { assetsFolders: extras[0].folders, assetsTags: extras[1].tags } : {}),
    }));
  } catch (error) {
    logError(error);
    if (generation === assetsRequestGeneration) set({ assetsLoading: false });
  }
}

export async function loadMoreAssetsImpl(set: StoreSet, get: StoreGet): Promise<void> {
  if (!get().assetsCursor || get().assetsLoading) return;
  await loadAssetsImpl(false, set, get);
}

export function setAssetsFiltersImpl(patch: Partial<AssetsFilters>, set: StoreSet, get: StoreGet): void {
  set((state) => ({ assetsFilters: { ...state.assetsFilters, ...patch } }));
  void loadAssetsImpl(true, set, get);
}

export async function saveToAssetsImpl(item: GenerateItem, set: StoreSet, get: StoreGet): Promise<boolean> {
  if (!item.filename) return false;
  const metadata = Object.fromEntries(Object.entries({ prompt: item.prompt, provider: item.provider, model: item.model, mediaType: item.mediaType, requestId: item.requestId, sessionId: item.sessionId, createdAt: item.createdAt }).filter(([, value]) => value !== undefined));
  try {
    const { asset } = await createAsset({ filePath: item.filename, kind: isVideoItem(item) ? "video" : "image", name: (item.prompt || "").trim().slice(0, 80) || item.filename, tags: [], metadata });
    const filters = get().assetsFilters;
    const admitted =
      (!filters.kind || filters.kind === asset.kind) && !filters.tag && !(filters.q || "").trim() && !filters.folderId;
    if (admitted) set((state) => ({ assets: [asset, ...state.assets.filter((entry) => entry.id !== asset.id)] }));
    return true;
  } catch (error) { logError(error); return false; }
}

export async function updateAssetItemImpl(id: string, patch: AssetUpdatePatch, set: StoreSet): Promise<boolean> {
  try { const { asset } = await updateAsset(id, patch); set((state) => ({ assets: state.assets.map((item) => item.id === id ? asset : item) })); return true; }
  catch (error) { logError(error); return false; }
}

export async function deleteAssetItemImpl(id: string, set: StoreSet): Promise<boolean> {
  try { await deleteAsset(id); set((state) => ({ assets: state.assets.filter((item) => item.id !== id) })); return true; }
  catch (error) { logError(error); return false; }
}

export async function createAssetFolderImpl(name: string, parentId: string | null | undefined, set: StoreSet): Promise<boolean> {
  try { await createAssetFolder({ name, parentId }); await refreshFolders(set); return true; }
  catch (error) { logError(error); return false; }
}

export async function renameAssetFolderImpl(id: string, name: string, set: StoreSet): Promise<boolean> {
  try { await updateAssetFolder(id, { name }); await refreshFolders(set); return true; }
  catch (error) { logError(error); return false; }
}

export async function moveAssetFolderImpl(id: string, parentId: string | null, set: StoreSet): Promise<boolean> {
  try { await updateAssetFolder(id, { parentId }); await refreshFolders(set); return true; }
  catch (error) { logError(error); return false; }
}

export async function deleteAssetFolderImpl(id: string, set: StoreSet): Promise<boolean> {
  try { await deleteAssetFolder(id); const [{ folders }, { tags }] = await Promise.all([getAssetFolders(), getAssetTags()]); set({ assetsFolders: folders, assetsTags: tags }); return true; }
  catch (error) { logError(error); return false; }
}
