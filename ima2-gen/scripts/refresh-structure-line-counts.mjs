#!/usr/bin/env node
/**
 * Refresh line counts in structure/01-file-function-map.md from live source files.
 * Usage:
 *   node scripts/refresh-structure-line-counts.mjs          # write updates
 *   node scripts/refresh-structure-line-counts.mjs --check  # exit 1 if drift
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const mapPath = join(root, "structure/01-file-function-map.md");
const checkOnly = process.argv.includes("--check");

const SCOPES = [
  /^lib\//,
  /^bin\/commands\//,
  /^bin\/lib\//,
  /^bin\/ima2\.ts$/,
  /^routes\//,
  /^server\.ts$/,
  /^config\.ts$/,
  /^ui\/src\//,
];

function lineCount(relPath) {
  const abs = join(root, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8").split("\n").length;
}

function inScope(relPath) {
  return SCOPES.some((re) => re.test(relPath));
}

/** Match table cells: `path` | count | ... */
const ROW_RE = /\| `([^`]+\.(?:ts|tsx))` \| (\d+|n\/a) \|/g;

function refresh(content) {
  const drifts = [];
  let updates = 0;

  const next = content.replace(ROW_RE, (full, relPath, current) => {
    if (!inScope(relPath)) return full;
    const actual = lineCount(relPath);
    if (actual == null) return full;
    const currentNum = current === "n/a" ? null : Number(current);
    if (currentNum === actual) return full;
    drifts.push({ relPath, current, actual });
    updates += 1;
    return full.replace(`| ${current} |`, `| ${actual} |`);
  });

  return { next, drifts, updates };
}

const original = readFileSync(mapPath, "utf8");
const { next, drifts, updates } = refresh(original);

if (checkOnly) {
  if (drifts.length > 0) {
    console.error(`structure/01 line-count drift (${drifts.length} files):`);
    for (const d of drifts) {
      console.error(`  ${d.relPath}: doc=${d.current} actual=${d.actual}`);
    }
    process.exit(1);
  }
  console.log("structure/01 line counts are current");
  process.exit(0);
}

if (updates === 0) {
  console.log("No line-count updates needed");
  process.exit(0);
}

writeFileSync(mapPath, next, "utf8");
console.log(`Updated ${updates} line counts in structure/01-file-function-map.md`);
for (const d of drifts) {
  console.log(`  ${d.relPath}: ${d.current} → ${d.actual}`);
}
