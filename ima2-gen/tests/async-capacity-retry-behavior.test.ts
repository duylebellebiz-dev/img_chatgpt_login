import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  submitAsyncJobWithCapacityRetry,
} from "../ui/src/lib/asyncJobSubmit.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("capacity retry forwards an AbortSignal to every async POST attempt", async () => {
  const signals: Array<AbortSignal | undefined> = [];
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    signals.push(init?.signal as AbortSignal | undefined);
    if (calls === 1) {
      return Response.json(
        { error: "too many", code: "TOO_MANY_JOBS" },
        { status: 429, headers: { "Retry-After": "0.001" } },
      );
    }
    return Response.json({ requestId: "req_test", async: true }, { status: 202 });
  };

  await submitAsyncJobWithCapacityRetry({
    url: "/api/generate",
    payload: { prompt: "retry" },
    requestId: "req_test",
    signal: new AbortController().signal,
    parseError: (res) => {
      const err = new Error(`failed ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      return err;
    },
  });

  assert.equal(calls, 2);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
});

test("capacity retry abort during Retry-After wait does not submit a later ghost job", async () => {
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json(
      { error: "too many", code: "TOO_MANY_JOBS" },
      { status: 429, headers: { "Retry-After": "0.001" } },
    );
  };

  const pending = submitAsyncJobWithCapacityRetry({
    url: "/api/generate",
    payload: { prompt: "abort retry" },
    requestId: "req_abort",
    signal: controller.signal,
    parseError: (res) => {
      const err = new Error(`failed ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      return err;
    },
  });

  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, { name: "AbortError" });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(calls, 1);
});
