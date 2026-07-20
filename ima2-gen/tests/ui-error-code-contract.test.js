import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSourceTree } from "./_readTree.mjs";

test("UI maps proxy and network errors to card surfaces", () => {
  const source = readFileSync("ui/src/lib/errorCodes.ts", "utf-8");
  assert.match(source, /NETWORK_FAILED:\s*\{ surface: "card", cardKey: "errorCard\.networkFailed"/);
  assert.match(source, /OAUTH_UNAVAILABLE:\s*\{ surface: "card", cardKey: "errorCard\.oauthUnavailable"/);
  assert.match(source, /INVALID_REQUEST:\s*\{ surface: "card", cardKey: "errorCard\.invalidRequest"/);
  assert.match(source, /EMPTY_RESPONSE:\s*\{ surface: "card", cardKey: "errorCard\.emptyResponse"/);
  assert.match(source, /STREAM_PARSE_FAILED:\s*\{ surface: "card", cardKey: "errorCard\.streamParseFailed"/);
  assert.match(source, /WEB_SEARCH_ONLY_RESPONSE:\s*\{ surface: "card", cardKey: "errorCard\.webSearchOnlyResponse"/);
  assert.match(source, /IMAGE_TOOL_FAILED:\s*\{ surface: "card", cardKey: "errorCard\.imageToolFailed"/);
  assert.match(source, /invalid_value/);
  assert.match(source, /minimum pixel budget/);
  assert.doesNotMatch(source, /content generation refused[^}]+MODERATION_REFUSED/s);
});

test("node API preserves status on JSON and SSE errors", () => {
  const source = readFileSync("ui/src/lib/nodeApi.ts", "utf-8");
  assert.match(source, /export type NodeErrorResponse = \{[\s\S]*status\?: number;/);
  assert.match(source, /e\.status = .*res\.status/);
  assert.match(source, /e\.code = /);
});

test("UI surfaces server terminal generation errors from inflight polling", () => {
  const store = readSourceTree("ui/src/store/useAppStore.ts");
  const api = readSourceTree("ui/src/lib/api.ts");

  assert.match(api, /Multimode generation failed/);
  assert.match(api, /e\.code = data\.code;/);
  assert.match(api, /cancelInflight/);
  assert.match(store, /includeTerminal: true/);
  assert.match(store, /terminalJobError/);
  assert.match(store, /terminal\.status === "error"/);
  assert.match(store, /handleError\(err, get\(\)\)/);
  assert.doesNotMatch(store, /if \(cur\.length === 0\) \{\s*await get\(\)\.reconcileInflight\(\);/);
});

test("invalid request and open-folder feedback i18n keys exist", () => {
  const en = readFileSync("ui/src/i18n/en.json", "utf-8");
  const ko = readFileSync("ui/src/i18n/ko.json", "utf-8");
  assert.match(en, /"openGeneratedDirOpened"/);
  assert.match(ko, /"openGeneratedDirOpened"/);
  assert.match(en, /"invalidRequest"/);
  assert.match(ko, /"invalidRequest"/);
  assert.match(en, /"emptyResponse"/);
  assert.match(ko, /"emptyResponse"/);
  assert.match(en, /"streamParseFailed"/);
  assert.match(ko, /"streamParseFailed"/);
  assert.match(en, /"webSearchOnlyResponse"/);
  assert.match(ko, /"webSearchOnlyResponse"/);
  assert.match(en, /"imageToolFailed"/);
  assert.match(ko, /"imageToolFailed"/);
});
