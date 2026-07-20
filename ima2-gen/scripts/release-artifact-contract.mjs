import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export function sha512(path) {
  return createHash("sha512").update(readFileSync(path)).digest();
}

export function verifyArtifactDigest(manifest, tarballPath) {
  const digest = sha512(tarballPath);
  const hex = digest.toString("hex");
  const integrity = `sha512-${digest.toString("base64")}`;
  if (manifest.sha512 !== hex || manifest.integrity !== integrity) {
    throw new Error(`release artifact digest mismatch for ${basename(tarballPath)}`);
  }
  return { sha512: hex, integrity };
}

function normalizePackManifest(value) {
  if (value?.filename) return value;
  const candidates = Array.isArray(value)
    ? value
    : Object.values(value || {}).flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
  const manifests = candidates.filter((entry) => entry?.filename);
  return manifests.length === 1 ? manifests[0] : null;
}

export function parsePackOutput(stdout) {
  const output = String(stdout).trimEnd();
  const starts = [];
  if (/^[{[]/.test(output)) starts.push(0);
  for (let index = 0; index < output.length - 1; index += 1) {
    if (output[index] === "\n" && (output[index + 1] === "[" || output[index + 1] === "{")) starts.push(index + 1);
  }
  for (const index of starts.reverse()) {
    try {
      const manifest = normalizePackManifest(JSON.parse(output.slice(index)));
      if (manifest) return manifest;
    } catch {
      // Lifecycle output can contain unrelated JSON; only the final npm manifest matters.
    }
  }
  throw new Error(`npm pack did not end with a JSON manifest\n${stdout}`);
}
