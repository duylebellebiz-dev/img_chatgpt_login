import type { GenerateItem } from "../types";
import { getHistory } from "../lib/api";
import { handleError } from "../lib/errorHandler";
import {
  type ServerTerminalJob,
  INFLIGHT_TTL_MS,
  getInflightQueryScopes,
  fetchInflightScopes,
  matchesInflightScope,
  toPersistedInFlightJob,
  terminalJobError,
  saveInFlight,
  loadInFlight,
  HISTORY_LIMIT,
  mapHistoryItem,
  historyKey,
  retainHistoryItems,
} from "./storeHelpers";
import { saveSelectedFilename } from "./storePersistence";
import type { AppState } from "./storeTypes";

type StoreSet = (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
type StoreGet = () => AppState;

export function startInFlightPollingImpl(
  set: StoreSet,
  get: StoreGet,
): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __ima2InflightTimer?: number; __ima2StopTicks?: number };
  if (w.__ima2InflightTimer) return;
  const tick = async () => {
    const cur = get().inFlight;
    const shouldStop = cur.length === 0 && get().activeGenerations === 0;
    if (shouldStop) {
      w.__ima2StopTicks = (w.__ima2StopTicks ?? 0) + 1;
      if (w.__ima2StopTicks >= 2 && w.__ima2InflightTimer) {
        clearInterval(w.__ima2InflightTimer);
        w.__ima2InflightTimer = undefined;
        w.__ima2StopTicks = 0;
      }
    } else {
      w.__ima2StopTicks = 0;
    }
    let scopedActiveServerIds = new Set<string>();
    if (!shouldStop) try {
      const scopes = getInflightQueryScopes(get());
      const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
      scopedActiveServerIds = new Set(jobs.map((j) => j.requestId));
      const byId = new Map(jobs.map((j) => [j.requestId, j] as const));
      const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
      const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
      let changed = false;
      const now0 = Date.now();
      const GRACE_MS = 5000;
      const nextInflight: typeof cur = [];
      for (const f of get().inFlight) {
        if (!matchesInflightScope(f, scopes)) {
          nextInflight.push(f);
          continue;
        }
        const terminal = terminalById.get(f.id);
        if (terminal) {
          changed = true;
          if (terminal.status === "error") {
            terminalErrors.push(terminalJobError(terminal));
          }
          continue;
        }
        if (!byId.has(f.id) && now0 - f.startedAt > GRACE_MS) {
          changed = true;
          continue;
        }
        const p = byId.get(f.id);
        if (p) {
          const serverJob = toPersistedInFlightJob(p);
          const nextJob = {
            ...f,
            phase: serverJob.phase,
            sessionId: serverJob.sessionId,
            parentNodeId: serverJob.parentNodeId,
            clientNodeId: serverJob.clientNodeId,
            kind: serverJob.kind,
          };
          if (
            nextJob.phase !== f.phase ||
            nextJob.sessionId !== f.sessionId ||
            nextJob.parentNodeId !== f.parentNodeId ||
            nextJob.clientNodeId !== f.clientNodeId ||
            nextJob.kind !== f.kind
          ) {
            changed = true;
          }
          nextInflight.push(nextJob);
        } else {
          nextInflight.push(f);
        }
      }
      const nextIds = new Set(nextInflight.map((f) => f.id));
      for (const j of jobs) {
        if (!nextIds.has(j.requestId)) {
          nextInflight.push(toPersistedInFlightJob(j));
          changed = true;
        }
      }
      if (changed) {
        saveInFlight(nextInflight);
        set({ inFlight: nextInflight, activeGenerations: nextInflight.length });
      }
      for (const err of terminalErrors) {
        handleError(err, get());
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[inflight] polling failed (fetchInflightScopes)", e);
    }
    try {
      const lastKnown = get().history.reduce(
        (max, it) => (it.createdAt && it.createdAt > max ? it.createdAt : max),
        0,
      );
      const { items } = await getHistory({ limit: HISTORY_LIMIT, since: lastKnown });
      const arr: GenerateItem[] = items.map(mapHistoryItem);
      if (arr.length > 0) {
        set((s) => {
          const seen = new Set(s.history.map(historyKey));
          const fresh = arr.filter((item) => {
            const key = historyKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (fresh.length === 0) return {};
          const nextCurrent = s.currentImage ?? fresh[0];
          if (!s.currentImage && fresh[0]?.filename) {
            saveSelectedFilename(fresh[0].filename);
          }
          return {
            history: retainHistoryItems(
              [...fresh, ...s.history],
              Math.max(HISTORY_LIMIT, s.history.length + fresh.length),
            ),
            currentImage: nextCurrent,
            loadedHistoryRetainLimit: Math.max(
              s.loadedHistoryRetainLimit,
              s.history.length + fresh.length,
            ),
          };
        });
      }
      const now = Date.now();
      const remaining = get().inFlight.filter(
        (f) => scopedActiveServerIds.has(f.id) || now - f.startedAt < INFLIGHT_TTL_MS,
      );
      if (remaining.length !== get().inFlight.length) {
        saveInFlight(remaining);
        set({ inFlight: remaining, activeGenerations: remaining.length });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[inflight] polling failed (getHistory)", e);
    }
  };
  w.__ima2InflightTimer = window.setInterval(tick, 1500) as unknown as number;
}

export async function reconcileInflightImpl(
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  try {
    const scopes = getInflightQueryScopes(get());
    const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
    const serverById = new Map(jobs.map((j) => [j.requestId, j] as const));
    const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
    const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
    const now = Date.now();
    const currentLocal = get().inFlight;
    const local = currentLocal.length > 0 ? currentLocal : loadInFlight();
    // Keep local entries that are either still known to the server,
    // or started very recently (<10s — request may be in-flight before
    // /api/inflight registered). Keep out-of-scope entries because this
    // request only asked the server about the current mode/session.
    const merged = local.flatMap((f) => {
      const serverJob = serverById.get(f.id);
      if (serverJob) {
        const restored = toPersistedInFlightJob(serverJob);
        return [{ ...f, ...restored, prompt: f.prompt || restored.prompt, phase: f.phase || restored.phase }];
      }
      if (!matchesInflightScope(f, scopes)) return [f];
      const terminal = terminalById.get(f.id);
      if (terminal) {
        if (terminal.status === "error") {
          terminalErrors.push(terminalJobError(terminal));
        }
        return [];
      }
      return now - f.startedAt < 10_000 ? [f] : [];
    });
    const localIds = new Set(merged.map((f) => f.id));
    for (const j of jobs) {
      if (!localIds.has(j.requestId)) {
        merged.push(toPersistedInFlightJob(j));
      }
    }
    saveInFlight(merged);
    set({ inFlight: merged, activeGenerations: merged.length });
    for (const err of terminalErrors) {
      handleError(err, get());
    }
    if (merged.length > 0) get().startInFlightPolling();
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[inflight] reconcile failed", e);
  }
}
