import { config } from "../config.js";
import { listHistoryRows } from "./historyList.js";

export type HistoryIndexRow = Awaited<ReturnType<typeof listHistoryRows>>[number];

type HistoryIndexSnapshot = {
  baseDir: string;
  builtAt: number;
  rows: HistoryIndexRow[];
};

const HISTORY_INDEX_TTL_MS = 3000;

let snapshot: HistoryIndexSnapshot | null = null;
let pending: Promise<HistoryIndexSnapshot> | null = null;
let generation = 0;

function isFreshIndex(current: HistoryIndexSnapshot | null, baseDir: string): boolean {
  return Boolean(
    current &&
      current.baseDir === baseDir &&
      Date.now() - current.builtAt < HISTORY_INDEX_TTL_MS,
  );
}

export async function getHistoryIndex(
  baseDir = config.storage.generatedDir,
): Promise<HistoryIndexSnapshot> {
  if (isFreshIndex(snapshot, baseDir)) return snapshot!;
  if (pending) return pending;

  const scanGeneration = generation;
  const scan = (async () => {
    const rows = await listHistoryRows(baseDir);
    const next = { baseDir, builtAt: Date.now(), rows };
    if (scanGeneration === generation) snapshot = next;
    return next;
  })();
  const tracked = scan.finally(() => {
    if (pending === tracked) pending = null;
  });
  pending = tracked;
  return pending;
}

export function invalidateHistoryIndex(): void {
  generation += 1;
  snapshot = null;
  pending = null;
}

export function invalidateFavoriteOverlay(): void {
  // Favorite state is browser-scoped and read from SQLite per request today.
  // Keep a no-op invalidation seam so future overlay caches do not touch the
  // global history index or leak favorite state across browsers.
}
