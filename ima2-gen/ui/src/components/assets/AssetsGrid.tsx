import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { AssetItem } from "../../store/storeTypes";

const GAP = 12;
const MIN_TILE = 180;

function mediaUrl(path: string) {
  return `/generated/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function AssetTile({ item }: { item: AssetItem }) {
  const { t } = useI18n();
  const deleteItem = useAppStore((s) => s.deleteAssetItem);
  const showToast = useAppStore((s) => s.showToast);
  const [armed, setArmed] = useState(false);
  const [near, setNear] = useState(false);
  const tileRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = tileRef.current;
    if (!node || item.kind !== "video" || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) setNear(true); }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.kind]);
  const url = item.filePath ? mediaUrl(item.filePath) : null;
  async function remove() {
    if (!armed) { setArmed(true); return; }
    if (!await deleteItem(item.id)) showToast(t("assets.actionFailed"), true);
    setArmed(false);
  }
  return <article ref={tileRef} className="assets-tile" tabIndex={0}>
    <div className="assets-tile__media">
      {url && item.kind === "video" ? (near ? <video src={url} preload="metadata" muted playsInline /> : null)
        : url ? <img src={url} alt="" loading="lazy" decoding="async" />
          : <span className="assets-tile__glyph" aria-hidden="true">{item.kind.slice(0, 1).toUpperCase()}</span>}
      <button type="button" className={`assets-tile__delete${armed ? " is-danger" : ""}`}
        aria-label={armed ? t("assets.confirmDelete") : t("assets.deleteAsset")} onClick={() => void remove()}>
        {armed ? t("assets.confirmDelete") : "×"}
      </button>
    </div>
    <div className="assets-tile__meta"><div className="assets-tile__title"><strong title={item.name}>{item.name}</strong><span>{item.kind}</span></div>
      {item.tags.length > 0 && <div className="assets-tile__tags">{item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
        {item.tags.length > 2 && <span>+{item.tags.length - 2}</span>}</div>}</div>
  </article>;
}

export function AssetsGrid() {
  const { t } = useI18n();
  const assets = useAppStore((s) => s.assets);
  const loading = useAppStore((s) => s.assetsLoading);
  const cursor = useAppStore((s) => s.assetsCursor);
  const loadMore = useAppStore((s) => s.loadMoreAssets);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(960);
  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const rows = useMemo(() => Array.from({ length: Math.ceil(assets.length / columns) }, (_, i) => assets.slice(i * columns, (i + 1) * columns)), [assets, columns]);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const update = () => {
      const cs = getComputedStyle(node);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      setWidth(Math.max(0, node.clientWidth - pad));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const rowHeight = Math.max(MIN_TILE, (width - GAP * (columns - 1)) / columns) + 70 + GAP;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => rootRef.current, estimateSize: () => rowHeight, overscan: 4 });
  const virtualRows = virtualizer.getVirtualItems();
  const lastIndex = virtualRows.at(-1)?.index;
  const requestMore = useCallback(() => { if (cursor && !loading) void loadMore(); }, [cursor, loading, loadMore]);
  useEffect(() => { if (lastIndex === rows.length - 1) requestMore(); }, [lastIndex, requestMore, rows.length]);
  return <div ref={rootRef} className="assets-grid-scroll">
    <div className="assets-grid-virtual" style={{ height: virtualizer.getTotalSize() }}>
      {virtualRows.map((row) => <div key={row.key} className="assets-grid-row" style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {rows[row.index]?.map((item) => <AssetTile key={item.id} item={item} />)}
      </div>)}
    </div>
    {cursor && <button type="button" className="assets-load-more" disabled={loading} onClick={requestMore}>{t("assets.loadMore")}</button>}
  </div>;
}
