import { editDownloadUrl, mediaUrl } from "../api";
import { AlertIcon, CheckCircleIcon, DownloadIcon, Spinner, XCircleIcon } from "./icons";

const STATUS_STYLES = {
  pending: "bg-neutral-100 text-neutral-600",
  processing: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-200 text-neutral-700",
};

export default function EditJobStatus({ job, cancelling, onCancel }) {
  if (!job) return null;
  const canCancel = job.status === "pending" || job.status === "processing";
  const isActive = job.status === "pending" || job.status === "processing";
  const pct = job.progress_total > 0 ? Math.round((job.progress_completed / job.progress_total) * 100) : 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-400">Edit job {job.job_id}</p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] ?? "bg-neutral-100 text-neutral-600"}`}
            >
              {isActive && <Spinner className="h-3 w-3 animate-spin" />}
              {job.status}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {canCancel && (
              <button
                type="button"
                onClick={() => onCancel?.(job.job_id)}
                disabled={cancelling}
                className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel"}
              </button>
            )}
            {job.zip_ready && (
              <a
                href={editDownloadUrl(job.job_id)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
              >
                <DownloadIcon className="h-4 w-4" />
                Download ZIP
              </a>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>
              {job.progress_completed} / {job.progress_total} photos
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {job.error_message && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {job.error_message}
          </p>
        )}
      </div>

      {job.edits.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {job.edits.map((e) => (
            <div key={e.id} className="overflow-hidden border border-neutral-200 bg-white shadow-sm">
              <div className="aspect-square w-full bg-neutral-100">
                {e.image_url ? (
                  <img src={mediaUrl(e.image_url)} alt="Edited result" className="h-full w-full object-cover" />
                ) : e.status === "failed" || e.status === "cancelled" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-neutral-400">
                    <XCircleIcon className="h-5 w-5" />
                    <span className="text-xs capitalize">{e.status}</span>
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-neutral-400">
                    <Spinner className="h-5 w-5 animate-spin" />
                    <span className="text-xs">editing...</span>
                  </div>
                )}
              </div>
              <div className="p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${
                      e.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : e.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {e.status === "completed" ? <CheckCircleIcon className="h-3 w-3" /> : null}
                    {e.status}
                  </span>
                </div>
                {e.error_message && <p className="mt-1.5 truncate text-red-600">{e.error_message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
