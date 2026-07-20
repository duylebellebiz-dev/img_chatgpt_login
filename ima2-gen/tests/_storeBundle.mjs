import { readFileSync } from "node:fs";
import { join } from "node:path";

const STORE_SOURCES = [
  "ui/src/store/useAppStore.ts",
  "ui/src/store/storeTypes.ts",
  "ui/src/store/storePersistence.ts",
  "ui/src/store/storeHelpers.ts",
  "ui/src/store/storeGraphSave.ts",
  "ui/src/store/storeNodeGenImpl.ts",
  "ui/src/store/storeGenImpl.ts",
  "ui/src/store/storeVideoImpl.ts",
  "ui/src/store/storeInflightImpl.ts",
  "ui/src/store/storeGraphNodeImpl.ts",
  "ui/src/store/storeHistoryImpl.ts",
  "ui/src/store/storeSessionImpl.ts",
  "ui/src/store/storeReferenceImpl.ts",
  "ui/src/store/storeSettingsImpl.ts",
  "ui/src/store/storePromptImpl.ts",
  "ui/src/store/storeGenerateEntryImpl.ts",
  "ui/src/store/storeUIImpl.ts",
  "ui/src/store/storeNodeRefImpl.ts",
];

export function readStoreBundle(root = process.cwd()) {
  return STORE_SOURCES.map((p) =>
    readFileSync(join(root, p), "utf8"),
  ).join("\n");
}

export function isStorePath(path) {
  return path === "ui/src/store/useAppStore.ts";
}
