import { useEffect, useState } from "react";
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, listSocialAccounts, mediaUrl } from "../api";
import { AlertIcon, FolderIcon, Spinner, TrashIcon } from "./icons";

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-800",
  archived: "bg-neutral-200 text-neutral-600",
};

function CreateCampaignForm({ onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [autoRefillAccountId, setAutoRefillAccountId] = useState("");
  const [autoRefillIntervalHours, setAutoRefillIntervalHours] = useState(24);

  useEffect(() => {
    listSocialAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (autoRefillEnabled && !autoRefillAccountId) {
      setError("Pick a connected account for auto-refill, or turn it off.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const account = accounts.find((a) => a.id === autoRefillAccountId);
      await createCampaign({
        name: name.trim(),
        description: description.trim(),
        autoRefillEnabled,
        autoRefillSocialAccountId: autoRefillEnabled ? autoRefillAccountId : null,
        autoRefillPlatform: autoRefillEnabled ? account?.platform : null,
        autoRefillIntervalHours: Number(autoRefillIntervalHours) || 24,
      });
      setName("");
      setDescription("");
      setAutoRefillEnabled(false);
      setAutoRefillAccountId("");
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-900">New campaign</p>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. He 2026 - luxury nail"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
        />
      </div>

      <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-3">
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700">
          <input
            type="checkbox"
            checked={autoRefillEnabled}
            onChange={(e) => setAutoRefillEnabled(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-violet-600 focus:ring-violet-400"
          />
          Auto-refill this campaign's content pipeline
        </label>
        <p className="mt-1 text-[11px] text-neutral-400">
          If fewer than a few posts are upcoming, a new batch is auto-generated from this campaign's last completed
          batch and auto-scheduled — publishing still always needs your explicit approval.
        </p>
        {autoRefillEnabled && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={autoRefillAccountId}
              onChange={(e) => setAutoRefillAccountId(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs focus:border-violet-400 focus:outline-none"
            >
              <option value="">Select an account</option>
              {accounts
                .filter((a) => a.status === "active")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.platform === "facebook_page" ? "Facebook" : "Instagram"})
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              Interval (hours)
              <input
                type="number"
                min={1}
                value={autoRefillIntervalHours}
                onChange={(e) => setAutoRefillIntervalHours(e.target.value)}
                className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="mt-2.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create campaign"}
      </button>
    </form>
  );
}

function CampaignDetail({ campaignId, onClose, onDeleted }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCampaign(campaignId)
      .then((data) => !cancelled && setDetail(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function handleDelete() {
    if (!window.confirm("Delete this campaign? Its batch jobs and posts stay, just ungrouped.")) return;
    await deleteCampaign(campaignId);
    onDeleted();
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-violet-900">{detail?.name || "Campaign"}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-violet-200 bg-white p-1.5 text-violet-700 transition-colors hover:bg-red-50 hover:text-red-700"
            aria-label="Delete campaign"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
          >
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner className="mt-3 h-4 w-4 animate-spin text-violet-400" />
      ) : error ? (
        <p className="mt-3 text-xs text-red-700">{error}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Batch jobs", detail.batch_job_count],
              ["Images", detail.image_count],
              ["Scheduled posts", detail.scheduled_post_count],
              ["Posted", detail.posted_count],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white p-2.5 text-center">
                <p className="text-lg font-semibold text-neutral-900">{value}</p>
                <p className="text-[11px] text-neutral-500">{label}</p>
              </div>
            ))}
          </div>

          {detail.batch_jobs.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-violet-800">Batch jobs</p>
              <ul className="mt-1.5 space-y-1">
                {detail.batch_jobs.map((job) => (
                  <li key={job.job_id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs">
                    <span className="truncate text-neutral-700">{job.description || job.job_id}</span>
                    <span className="shrink-0 text-neutral-400">{job.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.scheduled_posts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-violet-800">Scheduled posts</p>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {detail.scheduled_posts
                  .filter((p) => p.image_url)
                  .map((p) => (
                    <img
                      key={p.id}
                      src={mediaUrl(p.image_url)}
                      alt=""
                      className="aspect-square rounded-lg object-cover"
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCampaignId, setOpenCampaignId] = useState(null);

  async function loadCampaigns() {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await listCampaigns());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  return (
    <div className="space-y-4">
      <CreateCampaignForm onCreated={loadCampaigns} />

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Campaigns</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Group batch jobs and scheduled posts under one named push to see totals and performance together.
        </p>

        {loading ? (
          <Spinner className="mt-4 h-4 w-4 animate-spin text-neutral-400" />
        ) : error ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : campaigns.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">No campaigns yet — create one above.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenCampaignId(openCampaignId === c.id ? null : c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3.5 py-2.5 text-left transition-colors hover:border-violet-300"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderIcon className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{c.name}</p>
                      {c.description && <p className="text-xs text-neutral-400">{c.description}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.auto_refill_enabled && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        Auto-refill
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? "bg-neutral-100 text-neutral-600"}`}
                    >
                      {c.status}
                    </span>
                  </div>
                </button>
                {openCampaignId === c.id && (
                  <div className="mt-2">
                    <CampaignDetail
                      campaignId={c.id}
                      onClose={() => setOpenCampaignId(null)}
                      onDeleted={() => {
                        setOpenCampaignId(null);
                        loadCampaigns();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
