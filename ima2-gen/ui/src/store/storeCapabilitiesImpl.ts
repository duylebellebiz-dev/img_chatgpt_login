import { getCapabilities } from "../lib/api";
import { DEFAULT_REFERENCE_IMAGE_LIMIT } from "./storeHelpers";
import type { StoreSet } from "./storeTypes";

export function normalizeReferenceLimit(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_REFERENCE_IMAGE_LIMIT;
  return Math.max(1, Math.trunc(numeric));
}

export async function syncCapabilitiesImpl(set: StoreSet): Promise<void> {
  try {
    const capabilities = await getCapabilities();
    set({ referenceLimit: normalizeReferenceLimit(capabilities.limits?.maxRefCount) });
  } catch {
    set({ referenceLimit: DEFAULT_REFERENCE_IMAGE_LIMIT });
  }
}
