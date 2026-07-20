import { jsonFetch } from "./api-core";

export type PromptFolder = {
  id: string;
  parentId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type PromptItem = {
  id: string;
  folderId: string;
  name: string;
  text: string;
  tags: string[];
  mode: "auto" | "direct" | null;
  isFavorite: boolean;
  favoritedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PromptLibraryPage = {
  prompts: PromptItem[];
  folders: PromptFolder[];
};

export type PromptImportCandidate = {
  id: string;
  name: string;
  text: string;
  tags: string[];
  warnings?: string[];
  source?: {
    kind?: "local" | "github";
    owner?: string;
    repo?: string;
    ref?: string;
    path?: string;
    htmlUrl?: string;
    filename?: string;
    sourceId?: string;
  };
};

export type PromptGitHubFolderSource = {
  kind: "github-folder";
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
  htmlUrl?: string;
  apiUrl?: string;
  tags?: string[];
};

export type PromptGitHubFolderFile = {
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  htmlUrl: string;
  selected?: boolean;
  warnings?: string[];
};

export type PromptImportFolderFilesResponse = {
  source: PromptGitHubFolderSource;
  files: PromptGitHubFolderFile[];
  warnings: string[];
};

export type PromptImportFolderPreviewResponse = {
  source: PromptGitHubFolderSource;
  files: PromptGitHubFolderFile[];
  candidates: PromptImportCandidate[];
  warnings: string[];
};

export type PromptCuratedSource = {
  id: string;
  repo: string;
  owner?: string;
  name?: string;
  displayName: string;
  defaultRef: string;
  allowedPaths: string[];
  extensions: string[];
  sourceType: string;
  licenseSpdx: string;
  requiresAttribution: boolean;
  trustTier: string;
  lastVerifiedAt: string | null;
  notes: string;
  searchSeeds: string[];
  defaultSearch: boolean;
};

export type PromptDiscoveryReviewStatus = "candidate" | "approved" | "rejected";

export type PromptDiscoveryCandidate = {
  id: string;
  repo: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssues: number;
  updatedAt: string | null;
  pushedAt: string | null;
  licenseSpdx: string;
  topics: string[];
  language: string | null;
  score: number;
  scoreReasons: string[];
  warnings: string[];
  status: PromptDiscoveryReviewStatus;
  query: string;
  discoveredAt: string;
  reviewedAt?: string | null;
  reviewNotes?: string;
  approvedSource?: PromptCuratedSource | null;
};

export type PromptDiscoverySearchResponse = {
  candidates: PromptDiscoveryCandidate[];
  warnings: string[];
  rateLimit?: {
    limit: number | null;
    remaining: number | null;
    resetAt: string | null;
  };
};

export type PromptIndexedCandidate = PromptImportCandidate & {
  candidateId?: string;
  textPreview?: string;
  headingPath?: string | null;
  ordinal?: number;
  promptHash?: string;
  sourceFileId?: string;
  score?: number;
  scoreHints?: {
    modelHints?: string[];
    generationSurfaceHints?: string[];
    taskHints?: string[];
    sizeHints?: string[];
    qualityHints?: string[];
    warnings?: string[];
  };
};

export type PromptImportPreview = {
  source: {
    kind: "local" | "github";
    owner?: string;
    repo?: string;
    ref?: string;
    path?: string;
    filename?: string;
    htmlUrl?: string;
    tags?: string[];
  };
  candidates: PromptImportCandidate[];
  warnings: string[];
};

export function getPromptLibrary(params?: {
  search?: string;
  folderId?: string;
  favoritesOnly?: boolean;
}): Promise<PromptLibraryPage> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.folderId) qs.set("folderId", params.folderId);
  if (params?.favoritesOnly) qs.set("favoritesOnly", "1");
  return jsonFetch(`/api/prompts?${qs.toString()}`);
}

export function createPrompt(payload: {
  name?: string;
  text: string;
  tags?: string[];
  folderId?: string;
  mode?: "auto" | "direct";
}): Promise<{ prompt: PromptItem }> {
  return jsonFetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updatePrompt(
  id: string,
  payload: Partial<{
    name: string;
    text: string;
    tags: string[];
    folderId: string;
    mode: "auto" | "direct";
  }>,
): Promise<{ prompt: PromptItem }> {
  return jsonFetch(`/api/prompts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deletePrompt(id: string): Promise<{ ok: boolean }> {
  return jsonFetch(`/api/prompts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function togglePromptFavorite(id: string): Promise<{ isFavorite: boolean; favoritedAt: number | null }> {
  return jsonFetch(`/api/prompts/${encodeURIComponent(id)}/favorite`, { method: "POST" });
}

export function importPromptLibrary(payload: {
  version?: number;
  folders?: Array<{ id?: string; name: string; parentId?: string }>;
  prompts?: Array<{
    id?: string;
    name: string;
    text: string;
    tags?: string[];
    folderId?: string;
    mode?: "auto" | "direct";
    isFavorite?: boolean;
  }>;
}): Promise<{ foldersCreated: number; promptsImported: number; duplicatesSkipped: number }> {
  return jsonFetch("/api/prompts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function previewPromptImport(payload: {
  source:
    | { kind: "local"; filename: string; text: string }
    | { kind: "github"; input: string };
}): Promise<PromptImportPreview> {
  return jsonFetch("/api/prompts/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function commitPromptImport(payload: {
  candidates: PromptImportCandidate[];
  folderId?: string;
}): Promise<{ foldersCreated: number; promptsImported: number; duplicatesSkipped: number }> {
  return jsonFetch("/api/prompts/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getPromptImportCuratedSources(): Promise<{ sources: PromptCuratedSource[] }> {
  return jsonFetch("/api/prompts/import/curated-sources");
}

export function searchPromptImportCurated(payload: {
  q?: string;
  sourceIds?: string[];
  limit?: number;
}): Promise<{ results: PromptIndexedCandidate[]; sources: PromptCuratedSource[]; warnings: string[] }> {
  return jsonFetch("/api/prompts/import/curated-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function refreshPromptImportCuratedSource(payload: {
  sourceId: string;
}): Promise<{ source: PromptCuratedSource | null; indexedFiles: number; candidateCount: number; warnings: string[] }> {
  return jsonFetch("/api/prompts/import/curated-refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getPromptImportDiscovery(params?: {
  status?: PromptDiscoveryReviewStatus;
}): Promise<{ candidates: PromptDiscoveryCandidate[]; warnings: string[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return jsonFetch(`/api/prompts/import/discovery${suffix}`);
}

export function searchPromptImportDiscovery(payload: {
  q?: string;
  seeds?: string[];
  limit?: number;
}): Promise<PromptDiscoverySearchResponse> {
  return jsonFetch("/api/prompts/import/discovery-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: payload.q,
      seeds: payload.seeds,
      limit: payload.limit,
    }),
  });
}

export function reviewPromptImportDiscoveryCandidate(payload: {
  repo: string;
  status: "approved" | "rejected";
  reviewNotes?: string;
  allowedPaths?: string[];
  defaultSearch?: boolean;
}): Promise<{ candidate: PromptDiscoveryCandidate; source?: PromptCuratedSource | null; warnings: string[] }> {
  return jsonFetch("/api/prompts/import/discovery-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listPromptImportFolderFiles(payload: {
  source: { kind: "github-folder"; input: string };
}): Promise<PromptImportFolderFilesResponse> {
  return jsonFetch("/api/prompts/import/folder-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { kind: "github-folder", input: payload.source.input },
    }),
  });
}

export function previewPromptImportFolderFiles(payload: {
  source: { kind: "github-folder"; input: string };
  paths: string[];
}): Promise<PromptImportFolderPreviewResponse> {
  return jsonFetch("/api/prompts/import/folder-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { kind: "github-folder", input: payload.source.input },
      paths: payload.paths,
    }),
  });
}

export function exportPromptLibrary(): Promise<{
  version: number;
  exportedAt: string;
  folders: Array<{ id: string; name: string; parentId: string }>;
  prompts: Array<{
    id: string;
    name: string;
    text: string;
    tags: string[];
    folderId: string;
    mode: string | null;
    isFavorite: boolean;
  }>;
}> {
  return jsonFetch("/api/prompts/export");
}

export function getPromptFolders(): Promise<{ folders: PromptFolder[] }> {
  return jsonFetch("/api/prompts/folders");
}

export function createPromptFolder(payload: { name: string; parentId?: string }): Promise<{ folder: PromptFolder }> {
  return jsonFetch("/api/prompts/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updatePromptFolder(
  id: string,
  payload: { name?: string; parentId?: string },
): Promise<{ folder: PromptFolder }> {
  return jsonFetch(`/api/prompts/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deletePromptFolder(id: string, strategy?: "moveToRoot" | "deleteItems"): Promise<{ ok: boolean }> {
  const qs = strategy ? `?strategy=${strategy}` : "";
  return jsonFetch(`/api/prompts/folders/${encodeURIComponent(id)}${qs}`, { method: "DELETE" });
}
