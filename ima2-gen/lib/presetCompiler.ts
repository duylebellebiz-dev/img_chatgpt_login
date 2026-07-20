export type PresetCategory = "camera-motion" | "style" | "lighting";
export type PresetMode = "image" | "video" | "both";
export type PresetProvider = "gpt" | "grok" | "gemini";

export interface PresetDefinition {
  id: string;
  name: string;
  category: PresetCategory;
  promptFragment: string;
  perProvider?: Partial<Record<PresetProvider, {
    fragment?: string;
    params?: Record<string, unknown>;
  }>>;
  modes: PresetMode[];
  thumb?: string;
  previewVideo?: string;
}

export interface CompiledPresetResult {
  promptFragment: string;
  params: Record<string, unknown>;
  appliedPresetIds: string[];
  skipped: string[];
}

export function normalizePresetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string"))];
}

function supportsMode(preset: PresetDefinition, mode: "image" | "video") {
  return preset.modes.includes("both") || preset.modes.includes(mode);
}

export function compilePresets(opts: {
  catalog: PresetDefinition[];
  presetIds: string[];
  provider: PresetProvider;
  mode: "image" | "video";
}): CompiledPresetResult {
  const byId = new Map(opts.catalog.map((preset) => [preset.id, preset]));
  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  const appliedPresetIds: string[] = [];
  const skipped: string[] = [];

  for (const presetId of opts.presetIds) {
    const preset = byId.get(presetId);
    if (!preset || !supportsMode(preset, opts.mode)) {
      skipped.push(presetId);
      continue;
    }

    const providerConfig = preset.perProvider?.[opts.provider];
    fragments.push(providerConfig?.fragment ?? preset.promptFragment);
    Object.assign(params, providerConfig?.params);
    appliedPresetIds.push(presetId);
  }

  return {
    promptFragment: fragments.join(" "),
    params,
    appliedPresetIds,
    skipped,
  };
}
