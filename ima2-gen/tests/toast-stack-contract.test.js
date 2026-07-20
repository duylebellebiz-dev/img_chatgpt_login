import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSourceTree } from "./_readTree.mjs";

const storeSource = readSourceTree("ui/src/store/useAppStore.ts");
const toastSource = readFileSync("ui/src/components/Toast.tsx", "utf8");
const errorCardSource = readFileSync("ui/src/components/ErrorCard.tsx", "utf8");
const cssSource = readSourceTree("ui/src/index.css");

test("toast store keeps an append-only visible log with dismiss support", () => {
  assert.match(
    storeSource,
    /type ToastEntry = \{ message: string; error: boolean; id: number; createdAt: number \}/,
    "toast entries should preserve message, severity, id, and creation time",
  );
  assert.match(storeSource, /toastLog: ToastEntry\[\]/, "app state should expose a visible toast log");
  assert.match(storeSource, /errorCardLog: ErrorCardEntry\[\]/, "app state should expose a visible error-card log");
  assert.match(storeSource, /dismissToast: \(id: number\) => void/, "app state should expose per-toast dismissal");
  assert.match(storeSource, /dismissErrorCard: \(id\?: number\) => void/, "app state should expose per-error-card dismissal");
  assert.match(storeSource, /toastLog: \[\]/, "initial state should start with an empty toast log");
  assert.match(storeSource, /errorCardLog: \[\]/, "initial state should start with an empty error-card log");
  assert.match(
    storeSource,
    /toastLog: \[\.\.\.s\.toastLog, entry\]/,
    "showToast should append instead of replacing the visible stack",
  );
  assert.match(
    storeSource,
    /toastLog\.filter\(\(toast\) => toast\.id !== id\)/,
    "dismissToast should remove only the requested toast row",
  );
  assert.match(
    storeSource,
    /errorCardLog\.filter\(\(card\) => card\.id !== id\)/,
    "dismissErrorCard should remove only the requested error row",
  );
});

test("toast component renders a bottom-right stack with active-tab timeout behavior", () => {
  assert.match(toastSource, /TOAST_VISIBLE_TIMEOUT_MS = 3_000/, "active-tab timeout should be 3 seconds");
  assert.match(toastSource, /TOAST_MAX_VISIBLE = 5/, "visible toasts should be capped at 5");
  assert.match(toastSource, /\.slice\(-TOAST_MAX_VISIBLE\)/, "rows should be sliced to max visible");
  assert.match(toastSource, /document\.visibilityState === "visible"/, "tab activity should use visibility state");
  assert.match(toastSource, /visibilitychange/, "component should react to tab visibility changes");
  assert.match(toastSource, /className="toast-stack"/, "component should render a stack container");
  assert.match(toastSource, /errorCards = useAppStore\(\(s\) => s\.errorCardLog\)/, "error cards should join the same stack");
  assert.match(toastSource, /kind: "error-card"/, "central error cards should be converted into stack rows");
  assert.match(toastSource, /className="toast__dismiss"/, "each toast row should include a close button");
  assert.match(toastSource, /dismissToast\(toast\.id\)/, "close button and timeout should dismiss by toast id");
  assert.match(toastSource, /dismissErrorCard\(card\.id\)/, "error-card timeout should dismiss by card id");
  assert.doesNotMatch(errorCardSource, /error-card-backdrop/, "ErrorCard should not render a central blocking backdrop");
  assert.match(cssSource, /\.toast-stack\s*\{[\s\S]*bottom:\s*24px/, "toast stack should be bottom-aligned");
  assert.match(cssSource, /\.toast-stack\s*\{[\s\S]*right:\s*24px/, "toast stack should be right-aligned");
  assert.match(cssSource, /\.toast__message\s*\{[\s\S]*white-space:\s*nowrap/, "toast rows should stay one line");
  assert.match(cssSource, /\.toast__message\s*\{[\s\S]*text-overflow:\s*ellipsis/, "long toast rows should ellipsize");
});
