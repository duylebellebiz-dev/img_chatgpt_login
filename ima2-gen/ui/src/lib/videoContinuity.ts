import type { GenerateItem } from "../types";

export const ACTIVE_VIDEO_PROMPT_GUIDANCE = "Your video prompt should describe: visual flow, motion flow, sound/no-music intent, dialogue/no-dialogue, and the desired ending frame. Pace the scene to fill the selected duration naturally — opening composition, connected action/emotion change, and a stable ending frame.";

export type VideoContinuityEntry = {
  id: string;
  ordinal: number;
  role: "start" | "ancestor" | "parent" | "current";
  filename: string | null;
  userPrompt: string | null;
  revisedPrompt: string;
  createdAt: number;
};

export type VideoContinuityLineage = {
  lineageId: string;
  parentFilename: string | null;
  sourceFrame: "last" | null;
  maxEntries: 4;
  retention: "keep-start-plus-latest-3";
  entries: VideoContinuityEntry[];
};

export type VideoReferenceDragPayload = {
  image: string;
  url?: string;
  filename?: string;
  prompt?: string | null;
  userPrompt?: string | null;
  revisedPrompt?: string | null;
  createdAt?: number;
  mediaType?: string;
  videoContinuity?: VideoContinuityLineage | null;
};

export function trimLineageEntries(entries: VideoContinuityEntry[]): VideoContinuityEntry[] {
  const kept = entries.length <= 4 ? entries : [entries[0], ...entries.slice(-3)];
  return kept.map((entry, index) => ({
    ...entry,
    ordinal: index + 1,
    role: index === 0 ? "start" : index === kept.length - 1 ? "parent" : "ancestor",
  }));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildVideoContinuityFromItem(item: Pick<GenerateItem, "filename" | "userPrompt" | "revisedPrompt" | "createdAt" | "videoContinuity"> & { prompt?: string | null }): VideoContinuityLineage | null {
  if (item.videoContinuity?.entries?.length) {
    return {
      ...item.videoContinuity,
      parentFilename: item.filename ?? item.videoContinuity.parentFilename ?? null,
      sourceFrame: "last",
      entries: trimLineageEntries(item.videoContinuity.entries),
    };
  }
  const revisedPrompt = text(item.revisedPrompt) ?? text(item.prompt);
  if (!revisedPrompt) return null;
  const filename = item.filename ?? null;
  return {
    lineageId: `lineage:${filename ?? Date.now()}`,
    parentFilename: filename,
    sourceFrame: "last",
    maxEntries: 4,
    retention: "keep-start-plus-latest-3",
    entries: [{
      id: `clip:${filename ?? "unknown"}`,
      ordinal: 1,
      role: "start",
      filename,
      userPrompt: text(item.userPrompt) ?? text(item.prompt),
      revisedPrompt,
      createdAt: item.createdAt ?? Date.now(),
    }],
  };
}

export function buildVideoDragPayload(item: GenerateItem): VideoReferenceDragPayload {
  return {
    image: item.url || item.image,
    url: item.url,
    filename: item.filename,
    prompt: item.prompt ?? null,
    userPrompt: item.userPrompt ?? null,
    revisedPrompt: item.revisedPrompt ?? null,
    createdAt: item.createdAt,
    mediaType: item.mediaType,
    videoContinuity: item.videoContinuity ?? null,
  };
}

export function buildContinuityPromptChip(lineage: VideoContinuityLineage): { id: string; name: string; text: string } {
  const latest = lineage.entries[lineage.entries.length - 1];
  return {
    id: `video-continuity:${lineage.lineageId}`,
    name: "Video Continuity",
    text: [
      "Video continuity context:",
      "The attached image is the last frame of the previous video.",
      latest ? `Continue from previous revisedPrompt #${latest.ordinal}: ${latest.revisedPrompt}` : null,
      "The new prompt must define next motion, camera, sound/music/no-music, dialogue/no-dialogue, and ending frame.",
      "Pace the new clip to naturally fill the selected duration with a production-level sequence from the last-frame anchor.",
    ].filter(Boolean).join("\n"),
  };
}

export function continuitySummary(lineage: VideoContinuityLineage | null | undefined): string | null {
  if (!lineage?.entries?.length) return null;
  const latest = lineage.entries[lineage.entries.length - 1];
  return `${lineage.entries.length}/4 clips · last frame · ${latest?.filename ?? "unsaved source"}`;
}
