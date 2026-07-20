import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { clearAllAssets as apiClearAll } from "../../lib/api-assets";
import { Select, type SelectItem } from "../controls/Select";
import { AssetsFolderTree } from "./AssetsFolderTree";
import { AssetsGrid } from "./AssetsGrid";

const kinds = ["image", "video", "element", "preset", "template"] as const;
type KindValue = "" | typeof kinds[number];

export function AssetsWorkspace() {
  const { t } = useI18n();
  const assets = useAppStore((s) => s.assets);
  const tags = useAppStore((s) => s.assetsTags);
  const filters = useAppStore((s) => s.assetsFilters);
  const loading = useAppStore((s) => s.assetsLoading);
  const loadAssets = useAppStore((s) => s.loadAssets);
  const setFilters = useAppStore((s) => s.setAssetsFilters);
  const [query, setQuery] = useState(filters.q);
  const kindItems = useMemo<SelectItem<KindValue>[]>(() => [
    { value: "", label: t("assets.kindAll") },
    ...kinds.map((k) => ({ value: k, label: t(`assets.kind${k[0].toUpperCase()}${k.slice(1)}`) })),
  ], [t]);
  useEffect(() => { void loadAssets(true); }, [loadAssets]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters({ q: query }), 300); return () => window.clearTimeout(timer); }, [query, setFilters]);
  const filtered = Boolean(filters.q || filters.kind || filters.tag);
  const empty = assets.length === 0 && !loading;
  const emptyTitle = filters.folderId ? "assets.emptyFolderTitle" : filtered ? "assets.emptySearchTitle" : "assets.emptyTitle";
  const emptyBody = filters.folderId ? "assets.emptyFolderBody" : filtered ? "assets.emptySearchBody" : "assets.emptyBody";
  return <section className="assets-workspace" aria-labelledby="assets-title">
    <AssetsFolderTree />
    <main className="assets-workspace__main">
      <header className="assets-toolbar"><div className="assets-toolbar__title"><h1 id="assets-title">{t("assets.title")}</h1><span>{t("assets.itemCount", { count: assets.length })}</span></div>
        <div className="assets-toolbar__controls"><input type="search" value={query} placeholder={t("assets.searchPlaceholder")} aria-label={t("assets.searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
          <Select<KindValue> items={kindItems} value={(filters.kind ?? "") as KindValue} onChange={(v) => setFilters({ kind: v || null })} ariaLabel={t("assets.kindAll")} />
          {assets.length > 0 && <button type="button" className="assets-clear-btn" onClick={async () => { if (confirm(t("assets.clearConfirm"))) { await apiClearAll(); void loadAssets(true); } }}>{t("assets.clearAll")}</button>}
        </div>
        {tags.length > 0 && <div className="assets-tag-filter">{tags.map((tag) => <button type="button" key={tag} className={filters.tag === tag ? "is-active" : ""} onClick={() => setFilters({ tag: filters.tag === tag ? null : tag })}>{tag}</button>)}</div>}
      </header>
      {empty ? <div className="assets-empty"><h2>{t(emptyTitle)}</h2><p>{t(emptyBody)}</p></div> : <AssetsGrid />}
    </main>
  </section>;
}
