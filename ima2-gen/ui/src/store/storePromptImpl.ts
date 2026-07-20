import {
  getPromptLibrary,
  createPrompt,
  deletePrompt,
  togglePromptFavorite,
  toggleGalleryFavorite,
  importPromptLibrary,
} from "../lib/api";
import { t } from "../i18n";
import { saveGenerationDefaultsPatch } from "./storePersistence";
import type { InsertedPrompt, StoreSet, StoreGet } from "./storeTypes";

export function insertPromptToComposerImpl(prompt: InsertedPrompt, set: StoreSet): void {
  set((state) => {
    const exists = state.insertedPrompts.some((item) => item.id === prompt.id);
    const nextPrompt: InsertedPrompt = {
      ...prompt,
      placement: prompt.placement === "after" ? "after" : "before",
    };
    const insertedPrompts = exists
      ? state.insertedPrompts
      : [...state.insertedPrompts, nextPrompt];
    saveGenerationDefaultsPatch({ insertedPrompts });
    return { insertedPrompts };
  });
}

export function removeInsertedPromptFromComposerImpl(id: string, set: StoreSet): void {
  set((state) => {
    const insertedPrompts = state.insertedPrompts.filter((prompt) => prompt.id !== id);
    saveGenerationDefaultsPatch({ insertedPrompts });
    return {
      insertedPrompts,
      videoContinuityLineage: id.startsWith("video-continuity:")
        ? null
        : state.videoContinuityLineage,
    };
  });
}

export function moveInsertedPromptInComposerImpl(
  id: string,
  direction: "up" | "down",
  set: StoreSet,
): void {
  set((state) => {
    const before = state.insertedPrompts.filter((prompt) => prompt.placement !== "after");
    const after = state.insertedPrompts.filter((prompt) => prompt.placement === "after");
    const visualOrder: Array<{ kind: "prompt"; prompt: InsertedPrompt } | { kind: "main" }> = [
      ...before.map((prompt) => ({ kind: "prompt" as const, prompt })),
      { kind: "main" as const },
      ...after.map((prompt) => ({ kind: "prompt" as const, prompt })),
    ];
    const sourceIndex = visualOrder.findIndex(
      (item) => item.kind === "prompt" && item.prompt.id === id,
    );
    if (sourceIndex < 0) return {};
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
    if (targetIndex < 0 || targetIndex >= visualOrder.length) return {};
    const [moving] = visualOrder.splice(sourceIndex, 1);
    visualOrder.splice(targetIndex, 0, moving);
    const mainIndex = visualOrder.findIndex((item) => item.kind === "main");
    const insertedPrompts = visualOrder
      .filter((item): item is { kind: "prompt"; prompt: InsertedPrompt } => item.kind === "prompt")
      .map((item, index): InsertedPrompt => ({
        ...item.prompt,
        placement: index < mainIndex ? "before" : "after",
      }));
    saveGenerationDefaultsPatch({ insertedPrompts });
    return { insertedPrompts };
  });
}

export function clearInsertedPromptsImpl(set: StoreSet): void {
  saveGenerationDefaultsPatch({ insertedPrompts: [] });
  set({ insertedPrompts: [], videoContinuityLineage: null });
}

export async function loadPromptLibraryImpl(set: StoreSet): Promise<void> {
  set({ promptLibraryLoading: true });
  try {
    const data = await getPromptLibrary();
    set({ promptLibrary: { prompts: data.prompts, folders: data.folders }, promptLibraryLoading: false });
  } catch (err) {
    console.error("[PromptLibrary] load failed", err);
    set({ promptLibraryLoading: false });
  }
}

export async function savePromptToLibraryImpl(
  payload: { name?: string; text: string; tags?: string[]; folderId?: string; mode?: "auto" | "direct" },
  _set: StoreSet,
  get: StoreGet,
): Promise<void> {
  try {
    await createPrompt(payload);
    await get().loadPromptLibrary();
    get().showToast(t("promptLibrary.saved"));
  } catch (err) {
    console.error("[PromptLibrary] save failed", err);
    get().showToast(t("promptLibrary.saveFailed"), true);
  }
}

export async function deletePromptFromLibraryImpl(id: string, _set: StoreSet, get: StoreGet): Promise<void> {
  try {
    await deletePrompt(id);
    await get().loadPromptLibrary();
  } catch (err) {
    console.error("[PromptLibrary] delete failed", err);
  }
}

export async function togglePromptFavoriteImpl(id: string, _set: StoreSet, get: StoreGet): Promise<void> {
  try {
    await togglePromptFavorite(id);
    await get().loadPromptLibrary();
  } catch (err) {
    console.error("[PromptLibrary] favorite toggle failed", err);
  }
}

export async function importPromptsToLibraryImpl(files: File[], _set: StoreSet, get: StoreGet): Promise<void> {
  try {
    const prompts: Array<{ name: string; text: string; tags: string[] }> = [];
    for (const file of files) {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) continue;
      const text = await file.text();
      if (!text.trim()) continue;
      const name = file.name.replace(/\.(txt|md|markdown)$/i, "");
      prompts.push({ name: name.trim() || t("promptLibrary.untitled"), text: text.trim(), tags: [] });
    }
    if (prompts.length === 0) {
      get().showToast(t("promptLibrary.importNoValidFiles"), true);
      return;
    }
    const result = await importPromptLibrary({ prompts });
    await get().loadPromptLibrary();
    get().showToast(t("promptLibrary.imported", { count: result.promptsImported }));
  } catch (err) {
    console.error("[PromptLibrary] import failed", err);
    get().showToast(t("promptLibrary.importFailed"), true);
  }
}

export async function toggleGalleryFavoriteImpl(filename: string, set: StoreSet, _get: StoreGet): Promise<void> {
  try {
    const result = await toggleGalleryFavorite(filename);
    set((s) => {
      const next = new Set(s.galleryFavorites);
      if (result.isFavorite) next.add(filename);
      else next.delete(filename);
      return { galleryFavorites: next };
    });
    set((s) => ({
      history: s.history.map((h) =>
        h.filename === filename ? { ...h, isFavorite: result.isFavorite } : h,
      ),
    }));
  } catch (err) {
    console.error("[GalleryFavorite] toggle failed", err);
  }
}
