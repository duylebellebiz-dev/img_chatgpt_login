/**
 * Pure helpers for the `multimodeSequences` store slice.
 *
 * Intentionally free of any store/DOM/runtime imports (generic over the value
 * type) so they can be unit-tested directly under `node --test` without
 * pulling in the browser-only zustand store.
 */

const HISTORY_PREVIEW_PREFIX = "history:";

/**
 * Drop an orphaned browsed-history preview entry (`history:<id>`) when
 * navigation leaves its grid, preventing unbounded growth of
 * `multimodeSequences` across a session (devlog 260603 RCA 01, Defect G;
 * completes the partial 7b22418 fix which only deleted live flight ids).
 *
 * Live-generation flights (keys WITHOUT the `history:` prefix) are never
 * touched — they may still be generating. No-ops when staying in the grid,
 * when there is no previous preview, or when the key is already absent.
 */
export function releaseOrphanedPreview<T>(
  sequences: Record<string, T>,
  previousPreviewId: string | null,
  staysInGrid: boolean,
): Record<string, T> {
  if (!previousPreviewId || staysInGrid) return sequences;
  if (!previousPreviewId.startsWith(HISTORY_PREVIEW_PREFIX)) return sequences;
  if (!(previousPreviewId in sequences)) return sequences;
  const next = { ...sequences };
  delete next[previousPreviewId];
  return next;
}
