import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function collectRoutePaths() {
  const routesDir = join(root, "routes");
  const paths = new Set();
  const routeRe = /app\.(?:get|post|put|patch|delete)\(\s*["'](\/api\/[^"']+)["']/g;

  for (const file of readdirSync(routesDir)) {
    if (!file.endsWith(".ts")) continue;
    const src = readSource(join("routes", file));
    for (const match of src.matchAll(routeRe)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

/** Normalize :param segments so docs can use wildcards or shorter forms. */
function docMentionsPath(apiDoc, routePath) {
  if (apiDoc.includes(routePath)) return true;
  const wildcard = routePath.replace(/:[^/]+/g, "*");
  if (wildcard !== routePath && apiDoc.includes(wildcard)) return true;
  const prefix = routePath.split("/:")[0];
  if (prefix.length > 10 && apiDoc.includes(prefix)) return true;
  return false;
}

describe("API docs contract", () => {
  it("docs/API.md documents every registered /api/* route path", () => {
    const apiDoc = readSource("docs/API.md");
    const paths = collectRoutePaths();
    const missing = paths.filter((p) => !docMentionsPath(apiDoc, p));

    assert.equal(
      missing.length,
      0,
      `docs/API.md missing routes:\n${missing.map((p) => `  - ${p}`).join("\n")}`,
    );
  });

  it("docs/API.md documents agent, video, and generation-request surfaces", () => {
    const apiDoc = readSource("docs/API.md");
    for (const needle of [
      "/api/agent/sessions",
      "/api/video/generate",
      "/api/generation-requests",
      "/api/quota",
      "/api/events",
      "/api/auth/switch",
    ]) {
      assert.match(apiDoc, new RegExp(needle.replace(/\//g, "\\/")));
    }
  });
});
