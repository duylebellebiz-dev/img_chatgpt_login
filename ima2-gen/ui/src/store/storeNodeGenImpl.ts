import type { ClientNodeId } from "../lib/graph";
import { postNodeGenerateStream } from "../lib/api";
import { deriveParentServerNodeIds } from "../lib/nodeGraph";
import {
  getSelectedNodeIds,
} from "../lib/nodeSelection";
import {
  getDirectUnselectedChildren,
  getUnselectedDownstreamIds,
  nodeHasImage,
  topologicalSortSelected,
  validateBatchDependencies,
  type NodeBatchMode,
} from "../lib/nodeBatch";
import { handleError } from "../lib/errorHandler";
import { t } from "../i18n";
import {
  type PersistedInFlight,
  stripDataUrlPrefix,
  isCanceledGenerationError,
} from "./storeHelpers";
import type { AppState } from "./storeTypes";
import { clearFlightAbort, registerFlightAbort } from "./flightAbortRegistry";

type StoreSet = (p: Partial<AppState>) => void;
type StoreGet = () => AppState;

const nodeGenerationLocks = new Set<string>();

export async function runGenerateNodeInPlaceImpl(
  clientId: ClientNodeId,
  options: {
    sizeOverride?: string;
    parentServerNodeIdOverride?: string | null;
    suppressToast?: boolean;
  },
  set: StoreSet,
  get: StoreGet,
  saveInflightFn: (list: PersistedInFlight[]) => void,
): Promise<string | null> {
  if (nodeGenerationLocks.has(clientId)) return null;
  nodeGenerationLocks.add(clientId);
  const beforeRepair = get().graphNodes;
  const repairedNodes = deriveParentServerNodeIds(beforeRepair, get().graphEdges);
  if (repairedNodes.some((n, i) => n.data.parentServerNodeId !== beforeRepair[i]?.data.parentServerNodeId)) {
    set({ graphNodes: repairedNodes });
  }
  const node = repairedNodes.find((n) => n.id === clientId);
  if (!node) {
    nodeGenerationLocks.delete(clientId);
    return null;
  }
  const { prompt, parentServerNodeId } = node.data;
  if (!prompt.trim()) {
    get().showToast(t("toast.promptRequired"), true);
    nodeGenerationLocks.delete(clientId);
    return null;
  }
  const nodeRefs = node.data.referenceImages ?? [];
  const s = get();
  const size = options.sizeOverride ?? s.getResolvedSize();
  const effectiveParentServerNodeId =
    options.parentServerNodeIdOverride !== undefined
      ? options.parentServerNodeIdOverride
      : parentServerNodeId;
  const incoming = get().graphEdges.find((edge) => edge.target === clientId);
  if (incoming && !effectiveParentServerNodeId) {
    get().showToast(t("node.parentImageRequired"), true);
    nodeGenerationLocks.delete(clientId);
    return null;
  }

  const requestSessionId = s.activeSessionId;
  const startedAt = Date.now();
  const randSuffix = Math.random().toString(36).slice(2, 6);
  const flightId = `fn_${clientId}_${startedAt}_${randSuffix}`;
  const controller = new AbortController();
  registerFlightAbort(flightId, controller);
  const nextInFlight: PersistedInFlight[] = [
    ...s.inFlight,
    {
      id: flightId,
      prompt,
      startedAt,
      kind: "node",
      sessionId: requestSessionId,
      clientNodeId: clientId,
    },
  ];
  saveInflightFn(nextInFlight);
  set({
    graphNodes: get().graphNodes.map((n) =>
      n.id === clientId
        ? {
            ...n,
            data: {
              ...n.data,
              status: "pending",
              pendingRequestId: flightId,
              recoveryRequestId: flightId,
              pendingPhase: "queued",
              pendingStartedAt: startedAt,
              partialImageUrl: null,
              error: undefined,
              size,
            },
          }
        : n,
    ),
    activeGenerations: s.activeGenerations + 1,
    inFlight: nextInFlight,
  });
  get().startInFlightPolling();

  let graphMutated = true;

  try {
    const res = await postNodeGenerateStream({
      parentNodeId: effectiveParentServerNodeId,
      prompt,
      quality: s.quality,
      size,
      format: s.format,
      moderation: s.moderation,
      provider: s.provider,
      model: s.imageModel,
      reasoningEffort: s.reasoningEffort,
      storyboard: s.storyboardActive || undefined,
      requestId: flightId,
      sessionId: requestSessionId,
      clientNodeId: clientId,
      contextMode: "parent-plus-refs",
      searchMode: s.webSearchEnabled ? "on" : "off",
      webSearchEnabled: s.webSearchEnabled,
      ...(nodeRefs.length
        ? { references: nodeRefs.map(stripDataUrlPrefix) }
        : {}),
    }, {
        onPartial: (partial) => {
          if (get().activeSessionId !== requestSessionId) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: "pending",
                      partialImageUrl: partial.image,
                      pendingPhase: "partial",
                    },
                  }
                : n,
            ),
          });
        },
        onPhase: (phase) => {
          if (get().activeSessionId !== requestSessionId) return;
          if (!phase.phase) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      pendingPhase: phase.phase ?? n.data.pendingPhase,
                    },
                  }
                : n,
            ),
          });
        },
      },
      { signal: controller.signal },
    );
    if (get().activeSessionId === requestSessionId) {
      set({
        graphNodes: get().graphNodes.map((n) => {
          if (n.id !== clientId) return n;
          const nextData = { ...n.data };
          delete nextData.partialImageUrl;
          return {
            ...n,
            data: {
              ...nextData,
              serverNodeId: res.nodeId,
              imageUrl: res.url,
              status: "ready",
              pendingRequestId: null,
              recoveryRequestId: null,
              pendingPhase: null,
              pendingStartedAt: null,
              elapsed: res.elapsed,
              reasoningEffort: res.reasoningEffort,
              webSearchCalls: res.webSearchCalls,
              model: res.model ?? null,
              size: res.size ?? null,
            },
          };
        }),
      });
      graphMutated = true;
      if (!options.suppressToast) {
        get().showToast(t("toast.nodeCreated", { id: res.nodeId.slice(0, 8), elapsed: res.elapsed }));
      }
    }
    return res.nodeId;
    // cross-session: result will be restored via recoverGraphNodesFromHistory
    // when the user returns to the originating session.
  } catch (err) {
    if (isCanceledGenerationError(err)) {
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === clientId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: n.data.imageUrl ? "ready" : "empty",
                    pendingRequestId: null,
                    recoveryRequestId: null,
                    pendingPhase: null,
                    pendingStartedAt: null,
                    partialImageUrl: null,
                    error: undefined,
                  },
                }
              : n,
          ),
        });
        graphMutated = true;
      }
      return null;
    }
    const msg = err instanceof Error ? err.message : t("toast.nodeCreateFailed");
    if (get().activeSessionId === requestSessionId) {
      set({
        graphNodes: get().graphNodes.map((n) =>
          n.id === clientId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  pendingRequestId: null,
                  pendingPhase: null,
                  pendingStartedAt: null,
                  partialImageUrl: null,
                  error: msg,
                },
              }
            : n,
        ),
      });
      graphMutated = true;
      handleError(err, get());
    }
    // cross-session: silent — user is on a different graph
    return null;
  } finally {
    nodeGenerationLocks.delete(clientId);
    const remaining = get().inFlight.filter((f) => f.id !== flightId);
    saveInflightFn(remaining);
    clearFlightAbort(flightId);
    set({
      activeGenerations: Math.max(0, get().activeGenerations - 1),
      inFlight: remaining,
    });
    if (get().activeSessionId === requestSessionId && graphMutated) {
      get().scheduleGraphSave();
      void get().flushGraphSave("node-complete");
    }
  }
}

export async function runNodeBatchImpl(
  mode: NodeBatchMode,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  if (get().nodeBatchRunning) return;
  const selectedIds = getSelectedNodeIds(get().graphNodes);
  if (selectedIds.length === 0) {
    get().showToast(t("nodeBatch.noneSelected"), true);
    return;
  }
  const blocked = validateBatchDependencies(get().graphNodes, get().graphEdges, selectedIds);
  if (blocked.length > 0) {
    get().showToast(t("nodeBatch.parentRequired", { count: blocked.length }), true);
    return;
  }
  const orderedIds = topologicalSortSelected(get().graphNodes, get().graphEdges, selectedIds);
  const selectedSet = new Set(selectedIds);
  const candidates = orderedIds.filter((id) => {
    if (mode === "regenerate-all") return true;
    const node = get().graphNodes.find((n) => n.id === id);
    return node ? !nodeHasImage(node) : false;
  });
  if (candidates.length === 0) {
    get().showToast(t("nodeBatch.nothingToRun"));
    return;
  }

  set({ nodeBatchRunning: true, nodeBatchStopping: false });
  const latestServerNodeIdByClientId = new Map<string, string>();
  let completed = 0;
  try {
    for (const candidateId of candidates) {
      if (get().nodeBatchStopping) break;
      const incoming = get().graphEdges.find((e) => e.target === candidateId);
      const parentOverride = incoming
        ? latestServerNodeIdByClientId.get(incoming.source)
          ?? get().graphNodes.find((n) => n.id === candidateId)?.data.parentServerNodeId
          ?? null
        : null;
      const nodeId = get().videoModelSelected
        ? await get().runVideoGenerate(candidateId as ClientNodeId).then(() => {
            const n = get().graphNodes.find((nd) => nd.id === candidateId);
            return n?.data.serverNodeId ?? null;
          })
        : await get().runGenerateNodeInPlace(candidateId as ClientNodeId, {
            parentServerNodeIdOverride: parentOverride,
            suppressToast: true,
          });
      if (!nodeId) {
        get().showToast(t("nodeBatch.failed", { done: completed, total: candidates.length }), true);
        break;
      }
      completed += 1;
      latestServerNodeIdByClientId.set(candidateId, nodeId);
      const directChildren = getDirectUnselectedChildren(get().graphEdges, candidateId, selectedSet);
      const downstream = new Set(getUnselectedDownstreamIds(get().graphEdges, selectedSet));
      set({
        graphNodes: get().graphNodes.map((n) => {
          if (!downstream.has(n.id)) return n;
          return {
            ...n,
            data: {
              ...n.data,
              status: "stale",
              parentServerNodeId: directChildren.includes(n.id)
                ? nodeId
                : n.data.parentServerNodeId,
              error: t("nodeBatch.staleBecauseParentChanged"),
            },
          };
        }),
      });
    }
    get().showToast(t("nodeBatch.finished", { done: completed, total: candidates.length }));
    get().scheduleGraphSave();
  } finally {
    set({ nodeBatchRunning: false, nodeBatchStopping: false });
  }
}
