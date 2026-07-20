type VideoSourceNode = {
  id: string;
  selected?: boolean;
  data?: {
    imageUrl?: string | null;
    parentServerNodeId?: string | null;
    referenceImages?: unknown[] | null;
    serverNodeId?: string | null;
  };
};

type VideoSourceEdge = {
  source: string;
  target: string;
};

type VideoSourceState = {
  uiMode?: string;
  providerUrlReference?: string | null;
  referenceImages?: unknown[] | null;
  graphNodes?: VideoSourceNode[] | null;
  graphEdges?: VideoSourceEdge[] | null;
};

function findParentNode(
  nodes: VideoSourceNode[],
  edges: VideoSourceEdge[],
  child: VideoSourceNode,
): VideoSourceNode | undefined {
  const parentServerNodeId = child.data?.parentServerNodeId;
  if (parentServerNodeId) {
    const byServerId = nodes.find((node) => node.data?.serverNodeId === parentServerNodeId);
    if (byServerId) return byServerId;
  }
  const incoming = edges.find((edge) => edge.target === child.id);
  return incoming ? nodes.find((node) => node.id === incoming.source) : undefined;
}

export function getEffectiveVideoSourceCount(state: VideoSourceState): number {
  if (state.providerUrlReference) return 1;
  if (state.uiMode === "node") {
    const nodes = state.graphNodes ?? [];
    const child = nodes.find((node) => node.selected);
    const refs = child?.data?.referenceImages?.length ?? 0;
    if (refs > 0) return refs;
    if (!child) return 0;
    const parent = findParentNode(nodes, state.graphEdges ?? [], child);
    return parent?.data?.imageUrl ? 1 : 0;
  }
  return state.referenceImages?.length ?? 0;
}
