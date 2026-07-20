import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const root = process.cwd();

export function readSourceTree(path) {
  const content = readFileSync(join(root, path), "utf8");
  const dir = dirname(path);
  const seen = new Set([path]);
  let combined = content;

  const tsRe = /(?:export|import)\s+[\s\S]*?from\s*["']\.\/([\w./-]+)["']/g;
  let m;
  while ((m = tsRe.exec(content)) !== null) {
    const base = m[1];
    for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
      const sub = join(dir, base + ext);
      if (seen.has(sub)) break;
      try {
        const subContent = readFileSync(join(root, sub), "utf8");
        seen.add(sub);
        combined += "\n" + subContent;
        break;
      } catch { /* not found with this ext */ }
    }
  }

  const cssRe = /@import\s+["']\.\/([\w./-]+)["']/g;
  while ((m = cssRe.exec(content)) !== null) {
    const sub = join(dir, m[1]);
    if (seen.has(sub)) continue;
    try {
      const subContent = readFileSync(join(root, sub), "utf8");
      seen.add(sub);
      combined += "\n" + subContent;
    } catch { /* not found */ }
  }

  return combined;
}
