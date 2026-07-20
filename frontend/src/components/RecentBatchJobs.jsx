import { useEffect, useState } from "react";
import { deleteBatchJob, getBatchJob, listBatchJobs } from "../api";
import { AlertIcon, Spinner } from "./icons";

const STATUS_STYLES = {
  pending: "bg-neutral-100 text-neutral-600",
  processing: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-200 text-neutral-700",
};

// Surfaces past batch job IDs (with a one-click copy) so they're still
// findable after a page reload wipes the in-memory `job` state that App.jsx
// otherwise only tracks for the run currently in progress.
export default function RecentBatchJobs({ onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setJobs(await listBatchJobs());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopy(jobId) {
    try {
      await navigator.clipboard.writeText(jobId);
      setCopiedId(jobId);
      setTimeout(() => setCopiedId((current) => (current === jobId ? null : current)), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the ID is still
      // visible in the title attribute for a manual copy.
    }
  }

  async function handleView(jobId) {
    setError(null);
    try {
      onSelectJob?.(await getBatchJob(jobId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(jobId) {
    if (!window.confirm("Delete this batch job? Its images will be removed from Cloudinary and cannot be recovered.")) {
      return;
    }
    setError(null);
    setDeletingId(jobId);
    try {
      await deleteBatchJob(jobId);
      setJobs((current) => current.filter((job) => job.job_id !== jobId));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Recent batch jobs</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Job IDs stay here even after a page reload — copy one to use in Bulk-schedule, or click a row to reopen it.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <Spinner className="mt-4 h-4 w-4 animate-spin text-neutral-400" />
      ) : jobs.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No batch jobs yet — create one above.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {jobs.map((job) => (
            <li
              key={job.job_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            >
              <button type="button" onClick={() => handleView(job.job_id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-neutral-800">{job.description || "(no description)"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-medium ${STATUS_STYLES[job.status] ?? "bg-neutral-100 text-neutral-600"}`}
                  >
                    {job.status}
                  </span>
                  {job.progress_completed}/{job.progress_total} images · {new Date(job.created_at).toLocaleString()}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleCopy(job.job_id)}
                title={job.job_id}
                className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-1.5 font-mono text-xs text-neutral-600 transition-colors hover:border-violet-300 hover:text-violet-700"
              >
                {copiedId === job.job_id ? "Copied!" : `${job.job_id.slice(0, 8)}…`}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(job.job_id)}
                disabled={deletingId === job.job_id || job.status === "pending" || job.status === "processing"}
                title={
                  job.status === "pending" || job.status === "processing"
                    ? "Cancel this job before deleting it"
                    : "Delete this job and its Cloudinary images"
                }
                className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingId === job.job_id ? "Deleting..." : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
