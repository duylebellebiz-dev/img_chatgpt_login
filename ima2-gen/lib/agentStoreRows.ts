import {
  DEFAULT_AGENT_GENERATION_SETTINGS,
  normalizeAgentGenerationSettings,
} from "./agentSettings.js";
import type {
  AgentImageHandle,
  AgentSessionSummary,
  AgentToolCallSummary,
  AgentTurn,
  AgentTurnRole,
  AgentTurnStatus,
} from "./agentTypes.js";

export type AgentSessionRow = {
  id: string;
  title: string;
  codexThreadId: string | null;
  lastTurnId: string | null;
  currentImageId: string | null;
  compacted: number;
  webSearchEnabled: number;
  generationSettings: string;
  updatedAt: number;
  imageCount: number;
};

export type AgentTurnRow = {
  id: string;
  role: AgentTurnRole;
  text: string;
  status: AgentTurnStatus;
  imageIds: string;
  webFindingIds: string;
  raw: string;
  createdAt: number;
};

export type AgentImageRow = {
  id: string;
  filename: string;
  url: string;
  thumbUrl: string | null;
  prompt: string | null;
  revisedPrompt: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
};

export function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 10_000) || fallback;
}

export function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function parseToolCalls(raw: string): AgentToolCallSummary[] | undefined {
  const toolCalls = parseJsonObject(raw).toolCalls;
  if (!Array.isArray(toolCalls)) return undefined;
  return toolCalls.filter((item): item is AgentToolCallSummary => (
    item &&
    typeof item === "object" &&
    typeof (item as { id?: unknown }).id === "string" &&
    typeof (item as { name?: unknown }).name === "string"
  ));
}

export function jsonStringArray(values: readonly string[] | undefined) {
  return JSON.stringify(Array.isArray(values) ? values.filter(Boolean) : []);
}

export function cleanStringArray(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
}

export function sessionFromRow(row: AgentSessionRow): AgentSessionSummary {
  return {
    id: row.id,
    title: row.title,
    codexThreadId: row.codexThreadId,
    lastTurnId: row.lastTurnId,
    lastImageId: row.currentImageId,
    imageCount: row.imageCount,
    compacted: row.compacted === 1,
    webSearchEnabled: row.webSearchEnabled === 1,
    generationSettings: normalizeAgentGenerationSettings(
      parseJsonObject(row.generationSettings),
      { ...DEFAULT_AGENT_GENERATION_SETTINGS, webSearchEnabled: row.webSearchEnabled === 1 },
    ),
    updatedAt: row.updatedAt,
  };
}

export function turnFromRow(row: AgentTurnRow): AgentTurn {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    status: row.status,
    imageIds: parseStringArray(row.imageIds),
    webFindingIds: parseStringArray(row.webFindingIds),
    toolCalls: parseToolCalls(row.raw),
    createdAt: row.createdAt,
  };
}

export function imageFromRow(row: AgentImageRow): AgentImageHandle {
  return {
    id: row.id,
    filename: row.filename,
    url: row.url,
    thumbUrl: row.thumbUrl,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
  };
}
