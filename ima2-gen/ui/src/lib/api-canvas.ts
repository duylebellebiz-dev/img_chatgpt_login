import type { SavedCanvasAnnotations } from "../types/canvas";
import type { EmbeddedGenerationMetadata, GenerateItem } from "../types";
import { jsonFetch, jsonFetchWithBrowserId } from "./api-core";

export type ImageMetadataReadResponse = {
  ok: boolean;
  metadata: EmbeddedGenerationMetadata | null;
  source: "xmp" | "png-comment" | null;
  warnings?: string[];
  code?: string;
  error?: string;
};

export function readImageMetadata(input: {
  filename: string;
  dataUrl: string;
}): Promise<ImageMetadataReadResponse> {
  return jsonFetch("/api/metadata/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchCanvasAnnotations(filename: string): Promise<{
  annotations: SavedCanvasAnnotations | null;
}> {
  return jsonFetchWithBrowserId(`/api/annotations/${encodeURIComponent(filename)}`);
}

export async function saveCanvasAnnotations(
  filename: string,
  payload: SavedCanvasAnnotations,
): Promise<void> {
  await jsonFetchWithBrowserId(`/api/annotations/${encodeURIComponent(filename)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annotations: payload }),
  });
}

export async function deleteCanvasAnnotations(filename: string): Promise<void> {
  await jsonFetchWithBrowserId(`/api/annotations/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

export function createCanvasVersion(payload: {
  sourceFilename: string;
  image: Blob;
  prompt?: string | null;
}): Promise<{ item: GenerateItem }> {
  const qs = new URLSearchParams({ sourceFilename: payload.sourceFilename });
  return jsonFetch(`/api/canvas-versions?${qs.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
    },
    body: payload.image,
  });
}

export function updateCanvasVersion(
  filename: string,
  payload: {
    image: Blob;
    sourceFilename?: string | null;
    prompt?: string | null;
    pixelEdited?: boolean;
  },
): Promise<{ item: GenerateItem }> {
  const qs = new URLSearchParams();
  if (payload.sourceFilename) qs.set("sourceFilename", payload.sourceFilename);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return jsonFetch(`/api/canvas-versions/${encodeURIComponent(filename)}${suffix}`, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      ...(payload.pixelEdited ? { "X-Ima2-Canvas-Pixel-Edited": "true" } : {}),
    },
    body: payload.image,
  });
}

export function recordCanvasAnnotationBake(
  filename: string,
  snapshot: SavedCanvasAnnotations,
  annotationOnly: boolean,
): Promise<{ item: GenerateItem }> {
  return jsonFetch(`/api/canvas-versions/${encodeURIComponent(filename)}/annotation-bake`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, annotationOnly }),
  });
}

export function revertCanvasAnnotations(filename: string): Promise<{
  item: GenerateItem;
  snapshot: SavedCanvasAnnotations | null;
  annotationOnly: boolean;
}> {
  return jsonFetch(`/api/canvas-versions/${encodeURIComponent(filename)}/revert-annotations`, {
    method: "POST",
  });
}
