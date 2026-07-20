import type { StateCreator } from "zustand";
import { loadGenerationDefaults, saveGenerationDefaultsPatch } from "./storePersistence";
import type { AppState, PresetState } from "./storeTypes";

function normalizePresetIds(ids: unknown[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
}

function persistPresetIds(presetIds: string[]): void {
  saveGenerationDefaultsPatch({ presetIds });
}

export const createPresetSlice: StateCreator<AppState, [], [], PresetState> = (set) => ({
  selectedPresetIds: loadGenerationDefaults().presetIds ?? [],
  addPreset: (id) => set((state) => {
    if (state.selectedPresetIds.includes(id)) return state;
    const selectedPresetIds = [...state.selectedPresetIds, id];
    persistPresetIds(selectedPresetIds);
    return { selectedPresetIds };
  }),
  removePreset: (id) => set((state) => {
    const selectedPresetIds = state.selectedPresetIds.filter((presetId) => presetId !== id);
    persistPresetIds(selectedPresetIds);
    return { selectedPresetIds };
  }),
  togglePreset: (id) => set((state) => {
    const selectedPresetIds = state.selectedPresetIds.includes(id)
      ? state.selectedPresetIds.filter((presetId) => presetId !== id)
      : [...state.selectedPresetIds, id];
    persistPresetIds(selectedPresetIds);
    return { selectedPresetIds };
  }),
  clearPresets: () => {
    persistPresetIds([]);
    set({ selectedPresetIds: [] });
  },
  restorePresetIds: (ids) => {
    const selectedPresetIds = normalizePresetIds(ids);
    persistPresetIds(selectedPresetIds);
    set({ selectedPresetIds });
  },
});
