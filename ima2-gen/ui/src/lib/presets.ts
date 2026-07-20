import cameraMotion from "../../../presets/camera-motion.json";
import style from "../../../presets/style.json";
import lighting from "../../../presets/lighting.json";
import type { PresetDefinition, PresetCategory } from "../../../lib/presetCompiler";

const ALL_PRESETS: PresetDefinition[] = [
  ...(cameraMotion as PresetDefinition[]),
  ...(style as PresetDefinition[]),
  ...(lighting as PresetDefinition[]),
];

export function getPresetById(id: string): PresetDefinition | undefined {
  return ALL_PRESETS.find((preset) => preset.id === id);
}

export function getPresetsByCategory(cat: PresetCategory): PresetDefinition[] {
  return ALL_PRESETS.filter((preset) => preset.category === cat);
}

export function getPresetsForMode(mode: "image" | "video"): PresetDefinition[] {
  return ALL_PRESETS.filter((preset) => preset.modes.includes("both") || preset.modes.includes(mode));
}

export function getAllPresets(): PresetDefinition[] {
  return [...ALL_PRESETS];
}
