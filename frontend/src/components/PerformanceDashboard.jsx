import { useEffect, useState } from "react";
import { getPerformanceSummary, mediaUrl, triggerPerformanceSync } from "../api";
import { AlertIcon, Spinner } from "./icons";

export default function PerformanceDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getPerformanceSummary());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await triggerPerformanceSync();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const degraded = summary && summary.total_posts_tracked === 0 && summary.total_posts_pending_metrics > 0;
  const maxEngagement = summary ? Math.max(1, ...summary.top_designs.map((d) => d.engagement)) : 1;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Performance</h3>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
        >
          {syncing ? "Refreshing..." : "Refresh now"}
        </button>
      </div>

      {loading ? (
        <Spinner className="mt-4 h-4 w-4 animate-spin text-neutral-400" />
      ) : error ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : (
        <>
          {degraded && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Waiting on Meta App Review approval for read_insights/instagram_manage_insights — engagement data will
              appear here once approved.
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-neutral-50 p-2.5">
              <p className="text-sm font-semibold text-neutral-900">{summary.total_reach}</p>
              <p className="text-[11px] text-neutral-500">Reach</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-2.5">
              <p className="text-sm font-semibold text-neutral-900">{summary.total_engagement}</p>
              <p className="text-[11px] text-neutral-500">Engagement</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-2.5">
              <p className="text-sm font-semibold text-neutral-900">{summary.total_posts_tracked}</p>
              <p className="text-[11px] text-neutral-500">Posts tracked</p>
            </div>
          </div>

          {summary.top_designs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-neutral-500">Top-performing designs</p>
              <div className="mt-2 space-y-2">
                {summary.top_designs.map((d) => (
                  <div key={d.image_id} className="flex items-center gap-2.5">
                    {d.image_url && (
                      <img src={mediaUrl(d.image_url)} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-neutral-600">{d.design_filename}</p>
                      <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-violet-600"
                          style={{ width: `${(d.engagement / maxEngagement) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">{d.engagement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
