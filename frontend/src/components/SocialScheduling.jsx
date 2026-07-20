import { useEffect, useRef, useState } from "react";
import {
  approveScheduledPost,
  bulkApproveScheduledPosts,
  bulkCreateScheduledPosts,
  connectFacebookUrl,
  createScheduledPost,
  deleteScheduledPost,
  disconnectSocialAccount,
  getBatchJob,
  getEditBatchJob,
  getImageEdit,
  listBatchJobs,
  listCampaigns,
  listScheduledPosts,
  listSocialAccounts,
  mediaUrl,
  rejectScheduledPost,
  selectSocialAccount,
  updateScheduledPost,
} from "../api";
import { AlertIcon, CalendarIcon, ImagesIcon, LinkIcon, Spinner, TrashIcon } from "./icons";
import SchedulingCalendar from "./SchedulingCalendar";

const STATUS_LABELS = {
  pending_content: "Generating content",
  pending_review: "Needs your review",
  approved: "Approved — will post at the scheduled time",
  posted: "Posted",
  failed: "Failed",
  rejected: "Rejected",
};

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// <option> text can't be CSS-truncated (it's OS-rendered, not styleable), and
// a batch job's description is often a full prompt sentence — so build a
// short label by hand instead of dumping the raw description in.
function batchJobLabel(job) {
  const shortId = job.job_id.slice(0, 8);
  const description = (job.description || "").trim();
  const summary = description.length > 36 ? `${description.slice(0, 36).trimEnd()}…` : description || "(no description)";
  return `${shortId} — ${summary} (${job.status}, ${job.progress_completed}/${job.progress_total})`;
}

function ConnectedAccounts({ accounts, loading, error, onDisconnect }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">Connected accounts</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Connect a Facebook Page (and its linked Instagram Business account) to enable auto-posting.
          </p>
        </div>
        <a
          href={connectFacebookUrl()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-violet-300 hover:text-violet-700"
        >
          <LinkIcon className="h-4 w-4" />
          Connect Facebook
        </a>
      </div>

      {loading ? (
        <Spinner className="mt-3 h-4 w-4 animate-spin text-neutral-400" />
      ) : error ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : accounts.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-400">No accounts connected yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-neutral-800">{a.name}</p>
                <p className="text-xs text-neutral-400">
                  {a.platform === "facebook_page" ? "Facebook Page" : "Instagram Business"} · {a.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDisconnect(a.id)}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700"
                aria-label={`Disconnect ${a.name}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PagePicker({ pendingAccounts, onSelect, selecting }) {
  const pages = pendingAccounts.filter((a) => a.platform === "facebook_page");
  if (pages.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-sm font-medium text-violet-900">Choose a Page to connect</p>
      <p className="mt-0.5 text-xs text-violet-700">
        Your Facebook account manages {pages.length} Page{pages.length > 1 ? "s" : ""}. Pick the one you want this app
        to post to — the others won't be connected.
      </p>
      <ul className="mt-3 space-y-2">
        {pages.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-white px-3 py-2"
          >
            <p className="text-sm font-medium text-neutral-800">{p.name}</p>
            <button
              type="button"
              disabled={selecting === p.id}
              onClick={() => onSelect(p.id)}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
            >
              {selecting === p.id ? "Connecting..." : "Use this Page"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOURCES = [
  { key: "batch", label: "Batch Generator" },
  { key: "editor", label: "Photo Editor" },
];

function SchedulePostForm({ accounts, onScheduled }) {
  const [source, setSource] = useState("batch");
  const [jobIdInput, setJobIdInput] = useState("");
  const [job, setJob] = useState(null);
  const [readyItems, setReadyItems] = useState([]);
  const [jobError, setJobError] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);

  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [suggestedDate, setSuggestedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const MAX_ITEMS = 10;

  function toggleSelected(id) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_ITEMS ? prev : [...prev, id]
    );
  }

  function handleSourceChange(nextSource) {
    setSource(nextSource);
    setJobIdInput("");
    setJob(null);
    setReadyItems([]);
    setSelectedItemIds([]);
    setJobError(null);
  }

  async function handleLoadJob(e) {
    e.preventDefault();
    if (!jobIdInput.trim()) return;
    setJobLoading(true);
    setJobError(null);
    setJob(null);
    setReadyItems([]);
    setSelectedItemIds([]);
    const id = jobIdInput.trim();
    try {
      if (source === "batch") {
        const result = await getBatchJob(id);
        setJob(result);
        setReadyItems((result.images || []).filter((img) => img.image_url));
      } else {
        try {
          const result = await getEditBatchJob(id);
          setJob(result);
          setReadyItems((result.edits || []).filter((e) => e.image_url));
        } catch {
          // Not a batch edit job — try it as a single standalone edit instead.
          const single = await getImageEdit(id);
          setJob(single);
          setReadyItems(single.image_url ? [single] : []);
        }
      }
    } catch (err) {
      setJobError(err.message);
    } finally {
      setJobLoading(false);
    }
  }

  async function handleSchedule(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const account = accounts.find((a) => a.id === selectedAccountId);
      await createScheduledPost({
        batchJobId: source === "batch" ? job.job_id : undefined,
        imageIds: source === "batch" ? selectedItemIds : undefined,
        editIds: source === "editor" ? selectedItemIds : undefined,
        socialAccountId: selectedAccountId,
        platform: account?.platform,
        suggestedDate: new Date(suggestedDate).toISOString(),
      });
      setNotice("Post scheduled. AI content will be generated ahead of the target time for your review.");
      setSelectedItemIds([]);
      onScheduled();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-900">Schedule a post</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Pick where the images come from, enter its job ID, choose 1-10 (2+ makes a carousel post), then set an account and a target time.
      </p>

      <div className="mt-2.5 inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => handleSourceChange(s.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              source === s.key ? "bg-violet-600 text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleLoadJob} className="mt-2.5 flex gap-2">
        <input
          type="text"
          value={jobIdInput}
          onChange={(e) => setJobIdInput(e.target.value)}
          placeholder={source === "batch" ? "Batch job ID" : "Edit job ID or single edit ID"}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={jobLoading}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
        >
          {jobLoading ? "Loading..." : "Load images"}
        </button>
      </form>
      {jobError && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {jobError}
        </p>
      )}

      {job && (
        <form onSubmit={handleSchedule} className="mt-3 space-y-3">
          {readyItems.length === 0 ? (
            <p className="text-xs text-neutral-400">Nothing ready to pick from yet.</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                Selected {selectedItemIds.length}/{MAX_ITEMS} — pick 2 or more for a carousel post.
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {readyItems.map((item) => {
                  const position = selectedItemIds.indexOf(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => toggleSelected(item.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                        position !== -1 ? "border-violet-500" : "border-transparent"
                      }`}
                    >
                      <img src={mediaUrl(item.image_url)} alt="" className="h-full w-full object-cover" />
                      {position !== -1 && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-medium text-white">
                          {position + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
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

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <CalendarIcon className="h-4 w-4 text-neutral-400" />
            <input
              type="datetime-local"
              value={suggestedDate}
              min={toDatetimeLocalValue(new Date())}
              onChange={(e) => setSuggestedDate(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </label>

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

          <button
            type="submit"
            disabled={submitting || selectedItemIds.length === 0 || !selectedAccountId || !suggestedDate}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? "Scheduling..." : "Schedule post"}
          </button>
        </form>
      )}
    </div>
  );
}

function BulkScheduleForm({ accounts, campaigns, onScheduled }) {
  const [sourceType, setSourceType] = useState("batch_job");
  const [sourceId, setSourceId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [intervalHours, setIntervalHours] = useState(24);
  const [imagesPerPost, setImagesPerPost] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [batchJobs, setBatchJobs] = useState([]);
  const [batchJobsLoading, setBatchJobsLoading] = useState(true);
  const [batchJobsError, setBatchJobsError] = useState(null);

  useEffect(() => {
    listBatchJobs()
      .then((jobs) => {
        setBatchJobs(jobs);
        setBatchJobsError(null);
      })
      .catch((err) => {
        setBatchJobs([]);
        setBatchJobsError(err.message);
      })
      .finally(() => setBatchJobsLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const account = accounts.find((a) => a.id === selectedAccountId);
      const result = await bulkCreateScheduledPosts({
        batchJobId: sourceType === "batch_job" ? sourceId.trim() : undefined,
        campaignId: sourceType === "campaign" ? sourceId : undefined,
        socialAccountId: selectedAccountId,
        platform: account?.platform,
        startDate: new Date(startDate).toISOString(),
        intervalHours: Number(intervalHours) || 24,
        imagesPerPost: Number(imagesPerPost) || 1,
      });
      setNotice(
        `Scheduled ${result.created.length} post(s).` +
          (result.skipped_already_scheduled ? ` ${result.skipped_already_scheduled} already scheduled.` : "") +
          (result.skipped_not_ready ? ` ${result.skipped_not_ready} not ready yet.` : "")
      );
      onScheduled();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-900">Bulk-schedule a whole batch or campaign</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Schedules every ready image at once, spaced evenly — instead of one click per image.
      </p>

      <div className="mt-2.5 inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
        {[
          { key: "batch_job", label: "Batch job ID" },
          { key: "campaign", label: "Campaign" },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setSourceType(s.key);
              setSourceId("");
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              sourceType === s.key ? "bg-violet-600 text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sourceType === "batch_job" && batchJobsError && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Couldn't load batch jobs: {batchJobsError}
        </p>
      )}
      {sourceType === "batch_job" && !batchJobsLoading && !batchJobsError && batchJobs.length === 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          No batch jobs found on your account yet — create one in the Batch Generator tab first.
        </p>
      )}
      {sourceType === "campaign" && campaigns.length === 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          No campaigns yet — create one in the Campaigns tab, or switch to "Batch job ID" above.
        </p>
      )}

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {sourceType === "batch_job" ? (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            required
            disabled={batchJobsLoading || batchJobs.length === 0}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none disabled:opacity-50"
          >
            <option value="">{batchJobsLoading ? "Loading batch jobs..." : "Select a batch job"}</option>
            {batchJobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {batchJobLabel(job)}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            required
            disabled={campaigns.length === 0}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none disabled:opacity-50"
          >
            <option value="">Select a campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          required
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
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

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <CalendarIcon className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            type="datetime-local"
            value={startDate}
            min={toDatetimeLocalValue(new Date())}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Interval (hours)
          <input
            type="number"
            min={1}
            value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)}
            className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Images per post
          <input
            type="number"
            min={1}
            max={10}
            value={imagesPerPost}
            onChange={(e) => setImagesPerPost(e.target.value)}
            className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">
        Groups consecutive ready images into a carousel post of this size (1 = one post per image, today's default).
      </p>

      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {notice && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

      <button
        type="submit"
        disabled={submitting || !sourceId || !selectedAccountId || !startDate}
        className="mt-2.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Scheduling..." : "Bulk-schedule"}
      </button>
    </form>
  );
}

function ReviewPostCard({ post, onChanged, cardRef, highlighted, campaignName }) {
  const [caption, setCaption] = useState(post.caption || "");
  const [hashtags, setHashtags] = useState(post.hashtags || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function withBusy(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border bg-white p-3 transition-colors ${
        highlighted ? "border-violet-400 ring-2 ring-violet-200" : "border-neutral-200"
      }`}
    >
      <div className="flex gap-3">
        {(() => {
          const urls = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
          if (urls.length === 0) return null;
          return (
            <div className="relative h-20 w-20 shrink-0">
              <img src={mediaUrl(urls[0])} alt="" className="h-20 w-20 rounded-lg object-cover" />
              {urls.length > 1 && (
                <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  +{urls.length - 1}
                </span>
              )}
            </div>
          );
        })()}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-neutral-400">
            {post.platform === "facebook_page" ? "Facebook" : "Instagram"} ·{" "}
            {post.suggested_date ? new Date(post.suggested_date).toLocaleString() : "No date"} ·{" "}
            {STATUS_LABELS[post.status] || post.status}
            {campaignName && (
              <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-violet-700">{campaignName}</span>
            )}
          </p>
          {post.status === "pending_review" ? (
            <>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
              />
              <input
                type="text"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-500 focus:border-violet-400 focus:outline-none"
              />
            </>
          ) : (
            <div>
              <p className="text-sm text-neutral-800">{post.caption}</p>
              <p className="text-xs text-neutral-400">{post.hashtags}</p>
            </div>
          )}
          {post.error_message && <p className="text-xs text-red-600">{post.error_message}</p>}
          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {post.status === "pending_review" && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => withBusy(() => updateScheduledPost(post.id, { caption, hashtags }))}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
              >
                Save edits
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => withBusy(() => approveScheduledPost(post.id))}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => withBusy(() => rejectScheduledPost(post.id))}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
          {post.status === "failed" && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => withBusy(() => deleteScheduledPost(post.id))}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SocialScheduling() {
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(null);

  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [selecting, setSelecting] = useState(null);

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);

  const [view, setView] = useState("list");
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const cardRefs = useRef({});
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsById, setCampaignsById] = useState({});
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkApproveError, setBulkApproveError] = useState(null);

  useEffect(() => {
    listCampaigns()
      .then((list) => {
        setCampaigns(list);
        setCampaignsById(Object.fromEntries(list.map((c) => [c.id, c.name])));
      })
      .catch(() => {
        setCampaigns([]);
        setCampaignsById({});
      });
  }, []);

  async function handleApproveAllPending() {
    if (reviewPosts.length === 0) return;
    if (!window.confirm(`Approve all ${reviewPosts.length} post(s) pending review?`)) return;
    setBulkApproving(true);
    setBulkApproveError(null);
    try {
      await bulkApproveScheduledPosts({ postIds: reviewPosts.map((p) => p.id) });
      await loadPosts();
    } catch (err) {
      setBulkApproveError(err.message);
    } finally {
      setBulkApproving(false);
    }
  }

  function handleSelectFromCalendar(post) {
    setView("list");
    setHighlightedPostId(post.id);
    setTimeout(() => {
      cardRefs.current[post.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightedPostId(null), 2000);
  }

  async function loadAccounts() {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const [active, pending] = await Promise.all([listSocialAccounts(), listSocialAccounts("pending_selection")]);
      setAccounts(active);
      setPendingAccounts(pending);
    } catch (err) {
      setAccountsError(err.message);
    } finally {
      setAccountsLoading(false);
    }
  }

  async function loadPosts() {
    setPostsLoading(true);
    setPostsError(null);
    try {
      setPosts(await listScheduledPosts());
    } catch (err) {
      setPostsError(err.message);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
    loadPosts();
    const interval = setInterval(loadPosts, 20000);
    return () => clearInterval(interval);
  }, []);

  async function handleSelectPage(accountId) {
    setSelecting(accountId);
    setAccountsError(null);
    try {
      await selectSocialAccount(accountId);
      await loadAccounts();
    } catch (err) {
      setAccountsError(err.message);
    } finally {
      setSelecting(null);
    }
  }

  async function handleDisconnect(accountId) {
    try {
      await disconnectSocialAccount(accountId);
      loadAccounts();
    } catch (err) {
      setAccountsError(err.message);
    }
  }

  const reviewPosts = posts.filter((p) => p.status === "pending_review");
  const otherPosts = posts.filter((p) => p.status !== "pending_review");
  const activeAccounts = accounts.filter((a) => a.status === "active");

  return (
    <div className="space-y-5">
      <ConnectedAccounts
        accounts={activeAccounts}
        loading={accountsLoading}
        error={accountsError}
        onDisconnect={handleDisconnect}
      />

      <PagePicker pendingAccounts={pendingAccounts} onSelect={handleSelectPage} selecting={selecting} />

      <SchedulePostForm accounts={activeAccounts} onScheduled={loadPosts} />

      <BulkScheduleForm accounts={activeAccounts} campaigns={campaigns} onScheduled={loadPosts} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-900">Scheduled posts</p>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "list" ? "bg-white text-violet-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <ImagesIcon className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "calendar" ? "bg-white text-violet-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Calendar
          </button>
        </div>
      </div>

      {postsLoading ? (
        <Spinner className="h-4 w-4 animate-spin text-neutral-400" />
      ) : postsError ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {postsError}
        </p>
      ) : view === "calendar" ? (
        <SchedulingCalendar posts={posts} onSelectPost={handleSelectFromCalendar} />
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-500">
                Pending your review {reviewPosts.length > 0 && `(${reviewPosts.length})`}
              </p>
              {reviewPosts.length > 0 && (
                <button
                  type="button"
                  disabled={bulkApproving}
                  onClick={handleApproveAllPending}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {bulkApproving ? "Approving..." : "Approve all"}
                </button>
              )}
            </div>
            {bulkApproveError && (
              <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {bulkApproveError}
              </p>
            )}
            {reviewPosts.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-400">Nothing waiting on you right now.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {reviewPosts.map((post) => (
                  <ReviewPostCard
                    key={post.id}
                    post={post}
                    onChanged={loadPosts}
                    cardRef={(el) => (cardRefs.current[post.id] = el)}
                    highlighted={highlightedPostId === post.id}
                    campaignName={post.campaign_id ? campaignsById[post.campaign_id] : null}
                  />
                ))}
              </div>
            )}
          </div>

          {otherPosts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500">All scheduled posts</p>
              <div className="mt-2 space-y-2">
                {otherPosts.map((post) => (
                  <ReviewPostCard
                    key={post.id}
                    post={post}
                    onChanged={loadPosts}
                    cardRef={(el) => (cardRefs.current[post.id] = el)}
                    highlighted={highlightedPostId === post.id}
                    campaignName={post.campaign_id ? campaignsById[post.campaign_id] : null}
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
