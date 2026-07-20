import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

const impl = await import("../ui/src/store/storeAssetsImpl.ts");
type StoreSet = Parameters<typeof impl.loadAssetsImpl>[1];
type StoreGet = Parameters<typeof impl.loadAssetsImpl>[2];

type AnyState = Record<string, unknown>;
type StorePatch = AnyState | ((state: AnyState) => AnyState);
type Deferred = { url: string; resolve: (response: Response) => void };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeStore(overrides: AnyState = {}) {
  let state: AnyState = {
    assets: [],
    assetsFolders: [],
    assetsTags: [],
    assetsLoading: false,
    assetsCursor: null,
    assetsFilters: { kind: null, folderId: null, tag: null, q: "" },
    ...overrides,
  };
  const set = (patch: StorePatch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  };
  const get = () => state;
  return {
    set: set as unknown as StoreSet, // justified: partial state fixture stands in for full AppState in slice-scoped test
    get: get as unknown as StoreGet, // justified: partial state fixture stands in for full AppState in slice-scoped test
    read: () => state,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assetRow(id: string, name: string) {
  return {
    id, kind: "image", name, filePath: `${name}.png`, folderId: null,
    notes: null, metadata: null, tags: [], createdAt: 1, updatedAt: 1,
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("assets ui store contract", () => {
  it("stale list responses never overwrite newer filter results (request race)", async () => {
    const store = makeStore();
    const pending: Deferred[] = [];
    globalThis.fetch = ((url: unknown) =>
      new Promise((resolve) => { pending.push({ url: String(url), resolve }); })) as typeof fetch; // justified: deferred fetch stub capturing requests for race orchestration

    const stale = impl.loadAssetsImpl(true, store.set, store.get);
    store.set({ assetsFilters: { kind: null, folderId: null, tag: null, q: "fresh" } });
    const fresh = impl.loadAssetsImpl(true, store.set, store.get);

    assert.equal(pending.length, 2);
    assert.match(pending[1].url, /q=fresh/);

    // Newer request wins: resolve its list + folders + tags first.
    pending[1].resolve(jsonResponse({ assets: [assetRow("a_fresh", "fresh")], nextCursor: null }));
    while (pending.length < 4) await tick();
    pending[2].resolve(jsonResponse({ folders: [] }));
    pending[3].resolve(jsonResponse({ tags: [] }));
    await fresh;

    // Stale request resolves afterwards and must be discarded.
    pending[0].resolve(jsonResponse({ assets: [assetRow("a_stale", "stale")], nextCursor: "cursor-stale" }));
    while (pending.length < 6) await tick();
    pending[4].resolve(jsonResponse({ folders: [] }));
    pending[5].resolve(jsonResponse({ tags: [] }));
    await stale;

    const state = store.read();
    const assets = state.assets as Array<{ id: string }>;
    assert.equal(assets.length, 1);
    assert.equal(assets[0].id, "a_fresh");
    assert.equal(state.assetsCursor, null);
    assert.equal(state.assetsLoading, false);
  });

  it("first save lands in an empty, unfiltered grid immediately", async () => {
    const store = makeStore();
    globalThis.fetch = (async () =>
      jsonResponse({ asset: assetRow("a_first", "first") }, 201)) as typeof fetch; // justified: fixed-response fetch stub for save path
    const item = { filename: "first.png", prompt: "first prompt", mediaType: "image" } as never; // justified: minimal GenerateItem fixture, full shape irrelevant here
    const ok = await impl.saveToAssetsImpl(item, store.set, store.get);
    assert.equal(ok, true);
    const assets = store.read().assets as Array<{ id: string }>;
    assert.equal(assets.length, 1);
    assert.equal(assets[0].id, "a_first");
  });

  it("save into a filtered view does not inject an excluded row", async () => {
    const store = makeStore({
      assetsFilters: { kind: null, folderId: null, tag: "picked", q: "" },
      assets: [],
    });
    globalThis.fetch = (async () =>
      jsonResponse({ asset: assetRow("a_tagless", "tagless") }, 201)) as typeof fetch; // justified: fixed-response fetch stub for save path
    const item = { filename: "tagless.png", prompt: "p", mediaType: "image" } as never; // justified: minimal GenerateItem fixture, full shape irrelevant here
    const ok = await impl.saveToAssetsImpl(item, store.set, store.get);
    assert.equal(ok, true);
    assert.equal((store.read().assets as Array<unknown>).length, 0);
  });
});
