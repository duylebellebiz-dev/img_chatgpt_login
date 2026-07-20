import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { releaseOrphanedPreview } from "../ui/src/lib/multimodeSequences.ts";

// Regression guard for the reload-recoverable gallery hang.
// Root cause + plan: devlog/_plan/260603_gallery-focus-white-screen-rca/
//   01_runtime-accumulation-hang.md, 10_fix-plan.md
// Strategy: (G) is verified by exercising the pure function directly; (E)/(F)
// are source contracts (no jsdom in this repo). All assertions FAIL on the
// pre-fix tree and PASS after the fix.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");
const seq = (id: string) => ({
  sequenceId: id,
  requestId: id,
  requested: 1,
  returned: 1,
  images: [],
  partials: [],
  status: "complete" as const,
});

// --- (G) Behavior: releaseOrphanedPreview pure function -----------------------

test("releaseOrphanedPreview drops the orphaned history: preview when leaving the grid", () => {
  const before = { "history:abc": seq("abc"), "flight-1": seq("f1") };
  const after = releaseOrphanedPreview(before, "history:abc", false);
  assert.equal("history:abc" in after, false, "orphaned history preview must be pruned");
  assert.equal("flight-1" in after, true, "live flight must be preserved");
  assert.equal("history:abc" in before, true, "input must not be mutated");
});

test("releaseOrphanedPreview keeps the preview when staying in the grid", () => {
  const before = { "history:abc": seq("abc") };
  assert.deepEqual(releaseOrphanedPreview(before, "history:abc", true), before);
});

test("releaseOrphanedPreview never touches live (non-history) flights", () => {
  const before = { "flight-1": seq("f1") };
  assert.deepEqual(releaseOrphanedPreview(before, "flight-1", false), before);
});

test("releaseOrphanedPreview no-ops on null preview or absent key", () => {
  const before = { "history:abc": seq("abc") };
  assert.deepEqual(releaseOrphanedPreview(before, null, false), before);
  assert.deepEqual(releaseOrphanedPreview(before, "history:missing", false), before);
});

// --- (E) No live <video> thumbnail fallback survives in gallery surfaces ------

for (const f of [
  "ui/src/components/HistoryStrip.tsx",
  "ui/src/components/GalleryImageTile.tsx",
  "ui/src/components/history/SidebarHistoryImageCard.tsx",
  "ui/src/components/history/SidebarHistorySequenceCard.tsx",
]) {
  test(`${f} mounts no live <video preload> thumbnail and uses the placeholder`, () => {
    const src = read(f);
    assert.doesNotMatch(src, /preload="metadata"/, `${f} must not mount a live <video> thumbnail`);
    assert.match(src, /VideoThumbPlaceholder/, `${f} must use the static placeholder`);
  });
}

// --- (E nuance) addHistory must not give videos an <img>-based thumb ----------

test("addHistory leaves video thumb undefined so the placeholder renders", () => {
  const src = read("ui/src/store/storeGraphSave.ts");
  assert.match(src, /isVideoItem\(item\)\s*\n?\s*\?\s*undefined/);
});

// --- (F) Focused media requests high fetch priority ---------------------------

test("Canvas focused <img> requests high fetch priority", () => {
  // Note: fetchPriority is in React's ImgHTMLAttributes but NOT
  // VideoHTMLAttributes, so it is applied to the focused <img> only. The
  // focused <video> holds a single decoder and does not contend like the
  // thumbnail flood does, so image priority is what matters for the hang.
  const src = read("ui/src/components/Canvas.tsx");
  assert.match(src, /fetchPriority="high"/, "focused image must request high fetch priority");
});

// --- (G) selectHistory + showHistorySequence wire the prune helper ------------

test("selectHistory prunes the orphaned preview via releaseOrphanedPreview", () => {
  const src = read("ui/src/store/storeHistoryImpl.ts");
  assert.match(src, /releaseOrphanedPreview\(state\.multimodeSequences, previewId, Boolean\(isWithinGrid\)\)/);
});

test("showHistorySequence prunes the previous preview before adding the new one", () => {
  const src = read("ui/src/store/storeHistoryImpl.ts");
  assert.match(src, /\.\.\.releaseOrphanedPreview\(state\.multimodeSequences, state\.multimodePreviewFlightId, false\)/);
});
