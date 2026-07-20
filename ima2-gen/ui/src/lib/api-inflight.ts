import { jsonFetch } from "./api-core";
import type { OAuthStatus, BillingResponse } from "../types";

export function getInflight(params?: {
  kind?: "classic" | "node" | "multimode" | "video";
  sessionId?: string;
  includeTerminal?: boolean;
}): Promise<{
  jobs: Array<{
    requestId: string;
    kind: string;
    prompt: string;
    startedAt: number;
    phase?: string;
    phaseAt?: number;
    meta?: Record<string, unknown>;
  }>;
  terminalJobs?: Array<{
    requestId: string;
    kind: string;
    status: "completed" | "error" | "canceled";
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    phase?: string;
    phaseAt?: number;
    httpStatus?: number;
    errorCode?: string;
    meta?: Record<string, unknown>;
  }>;
}> {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.sessionId) qs.set("sessionId", params.sessionId);
  if (params?.includeTerminal) qs.set("includeTerminal", "1");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return jsonFetch(`/api/inflight${suffix}`);
}

export function cancelInflight(requestId: string): Promise<{
  requestId: string;
  active: boolean;
  aborted: boolean;
}> {
  return jsonFetch<{
    requestId: string;
    active: boolean;
    aborted: boolean;
  }>(`/api/inflight/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}
export function getOAuthStatus(): Promise<OAuthStatus> {
  return jsonFetch<OAuthStatus>("/api/oauth/status");
}

export function getBilling(): Promise<BillingResponse> {
  return jsonFetch<BillingResponse>("/api/billing");
}
