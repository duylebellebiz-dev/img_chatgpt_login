import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface VideoSeriesMeta {
  revisedPrompt?: string;
  createdAt?: number;
  videoSeries?: { topic: string; chainIndex?: number };
}

/**
 * Scan generatedDir for videos with matching topic, return the most recent N revisedPrompts.
 */
export async function getVideoSeriesChain(generatedDir: string, topic: string, limit = 4): Promise<string[]> {
  if (!topic.trim()) return [];
  const entries = await readdir(generatedDir).catch(() => [] as string[]);
  const sidecars = entries.filter((e) => e.endsWith(".mp4.json"));
  const matches: Array<{ revisedPrompt: string; createdAt: number }> = [];
  for (const sidecar of sidecars) {
    try {
      const raw = await readFile(join(generatedDir, sidecar), "utf-8");
      const meta: VideoSeriesMeta = JSON.parse(raw);
      if (meta.videoSeries?.topic === topic && meta.revisedPrompt) {
        matches.push({ revisedPrompt: meta.revisedPrompt, createdAt: meta.createdAt ?? 0 });
      }
    } catch { /* skip unreadable */ }
  }
  matches.sort((a, b) => b.createdAt - a.createdAt);
  return matches.slice(0, limit).reverse().map((m) => m.revisedPrompt);
}
