import { jsonFetch } from "./api-core";

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  graphVersion: number;
  nodeCount: number;
};

export type SessionGraphNode = {
  id: string;
  x: number;
  y: number;
  data: Record<string, unknown>;
};
export type SessionGraphEdge = {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown>;
};
export type SessionFull = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  graphVersion: number;
  nodes: SessionGraphNode[];
  edges: SessionGraphEdge[];
};

export type GraphSaveMeta = {
  saveId?: string;
  saveReason?: string;
  tabId?: string;
};

export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return jsonFetch("/api/sessions");
}
export function createSession(title: string): Promise<{ session: SessionSummary }> {
  return jsonFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}
export function getSession(id: string): Promise<{ session: SessionFull }> {
  return jsonFetch(`/api/sessions/${encodeURIComponent(id)}`);
}
export function renameSession(id: string, title: string): Promise<{ ok: boolean }> {
  return jsonFetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}
export function deleteSession(id: string): Promise<{ ok: boolean }> {
  return jsonFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function saveSessionGraph(
  id: string,
  graphVersion: number,
  nodes: SessionGraphNode[],
  edges: SessionGraphEdge[],
  meta: GraphSaveMeta = {},
): Promise<{ ok: boolean; nodes: number; edges: number; graphVersion: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "If-Match": String(graphVersion),
  };
  if (meta.saveId) headers["X-Ima2-Graph-Save-Id"] = meta.saveId;
  if (meta.saveReason) headers["X-Ima2-Graph-Save-Reason"] = meta.saveReason;
  if (meta.tabId) headers["X-Ima2-Tab-Id"] = meta.tabId;
  return jsonFetch(`/api/sessions/${encodeURIComponent(id)}/graph`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ nodes, edges }),
  });
}

// ── Prompt Library (0.23) ─────────────────────────────────────────────────

