import { useEffect, useState } from "react";
import { getUsageSummary } from "../api";
import { AlertIcon, Spinner } from "./icons";

export default function UsageMeter() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getUsageSummary()
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner className="h-4 w-4 animate-spin text-neutral-400" />;
  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (!summary) return null;

  const hasBudget = summary.budget_usd > 0;
  const pct = hasBudget ? Math.min(100, Math.round((summary.total_cost_usd / summary.budget_usd) * 100)) : null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">
          API usage — {summary.year}-{String(summary.month).padStart(2, "0")}
        </h3>
        <p className="text-lg font-semibold text-neutral-900">${summary.total_cost_usd.toFixed(2)}</p>
      </div>

      {hasBudget ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>of ${summary.budget_usd.toFixed(2)} budget</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-neutral-400">No monthly budget configured — showing running total.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="rounded-lg bg-neutral-50 p-2.5">
          <p className="text-sm font-semibold text-neutral-900">{summary.total_requests}</p>
          <p className="text-[11px] text-neutral-500">Requests</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2.5">
          <p className="text-sm font-semibold text-neutral-900">${summary.anthropic_cost_usd.toFixed(2)}</p>
          <p className="text-[11px] text-neutral-500">Claude</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2.5">
          <p className="text-sm font-semibold text-neutral-900">{summary.gemini_oauth_requests}</p>
          <p className="text-[11px] text-neutral-500">Gemini OAuth images</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2.5">
          <p className="text-sm font-semibold text-neutral-900">{summary.gpt_oauth_requests ?? 0}</p>
          <p className="text-[11px] text-neutral-500">ChatGPT OAuth images</p>
        </div>
      </div>
    </div>
  );
}
