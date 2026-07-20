export const MAX_GENERATION_COUNT = 24;

export function normalizeGenerationCount(value: number): number {
  return Math.min(MAX_GENERATION_COUNT, Math.max(1, Math.trunc(value || 1)));
}
