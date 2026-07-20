import type { CanvasMemo } from "../../types/canvas";

const COLS = ["left", "center", "right"] as const;
const ROWS = ["top", "middle", "bottom"] as const;

export function describeMemoPosition(x: number, y: number): string {
  const col = COLS[Math.min(2, Math.max(0, Math.floor(x * 3)))];
  const row = ROWS[Math.min(2, Math.max(0, Math.floor(y * 3)))];
  const region = row === "middle" && col === "center" ? "center" : `${row} ${col}`;
  return `${region} area (x: ${Math.round(x * 100)}%, y: ${Math.round(y * 100)}% from top-left)`;
}

export function buildMemoEditInstructions(memos: CanvasMemo[]): string {
  const entries = memos
    .map((memo) => ({ ...memo, text: memo.text.trim() }))
    .filter((memo) => memo.text.length > 0);
  if (entries.length === 0) return "";
  return [
    "The numbered notes below are temporary editing instructions written on the image. They are not image content: interpret each one to locate and apply the requested change (percentages are relative to image width and height).",
    ...entries.map((memo, index) => `${index + 1}. At the ${describeMemoPosition(memo.x, memo.y)}: ${memo.text}`),
    "After applying every numbered instruction, remove all annotation markup. Do not render any annotation text, sticky notes, boxes, arrows, or markup in the output image. Where markup covered the image, show the underlying content reconstructed to match the surrounding texture, lighting, and perspective, with no residue, outline, or discoloration.",
    "Keep everything not named in the numbered instructions exactly the same as the source image: composition, subjects, lighting, colors, and background.",
  ].join("\n");
}
