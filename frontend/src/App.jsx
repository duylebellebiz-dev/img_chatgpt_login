import { useEffect, useRef, useState } from "react";
import UploadForm from "./components/UploadForm";
import JobStatus from "./components/JobStatus";
import RecentBatchJobs from "./components/RecentBatchJobs";
import PhotoEditor from "./components/PhotoEditor";
import LoginGate from "./components/LoginGate";
import NotificationBell from "./components/NotificationBell";
import SocialScheduling from "./components/SocialScheduling";
import CampaignManager from "./components/CampaignManager";
import Dashboard from "./components/Dashboard";
import { AlertIcon, CalendarIcon, ChartIcon, FolderIcon, ImagesIcon, SparklesIcon } from "./components/icons";
import { cancelBatchJob, createBatchJob, getBatchJob, getCurrentUser, logout } from "./api";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const MAX_POLL_ERRORS = 3;

const TABS = [
  { key: "batch", label: "Batch Generator", icon: ImagesIcon },
  { key: "edit", label: "Photo Editor", icon: SparklesIcon },
  { key: "social", label: "Social & Scheduling", icon: CalendarIcon },
  { key: "campaigns", label: "Campaigns", icon: FolderIcon },
  { key: "dashboard", label: "Dashboard", icon: ChartIcon },
];

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await getCurrentUser());
      } catch {
        // not logged in yet — LoginGate will be shown
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  if (!authChecked) return null;
  if (!user) return <LoginGate onLoggedIn={setUser} />;

  return <AuthenticatedApp user={user} onLogout={() => setUser(null)} />;
}

function initialTab() {
  const requested = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((t) => t.key === requested) ? requested : "batch";
}

function AuthenticatedApp({ user, onLogout }) {
  const [tab, setTab] = useState(initialTab);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [job, setJob] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitNotice, setSubmitNotice] = useState(null);
  const pollRef = useRef(null);
  const pollErrorCountRef = useRef(0);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(payload) {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);
    setJob(null);
    clearInterval(pollRef.current);
    pollErrorCountRef.current = 0;

    try {
      const created = await createBatchJob(payload);
      if (created.cap_message) {
        setSubmitNotice(created.cap_message);
      }
      const jobId = created.job_id;

      const poll = async () => {
        try {
          const status = await getBatchJob(jobId);
          pollErrorCountRef.current = 0;
          setJob(status);
          if (TERMINAL_STATUSES.has(status.status)) {
            clearInterval(pollRef.current);
          }
        } catch (err) {
          pollErrorCountRef.current += 1;
          if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
            setSubmitError(err.message);
            clearInterval(pollRef.current);
          }
        }
      };

      await poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(jobId) {
    setCancelling(true);
    setSubmitError(null);
    try {
      await cancelBatchJob(jobId);
      clearInterval(pollRef.current);
      const status = await getBatchJob(jobId);
      setJob(status);
      setSubmitNotice("Batch image generation was cancelled.");
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/60 via-white to-white">
      <header className="border-b border-neutral-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div className="flex-1">
            <p className="text-base leading-tight font-semibold text-neutral-900">NailSocial AI</p>
            <p className="text-xs text-neutral-500">AI marketing studio for nail salons</p>
          </div>
          <NotificationBell />
          <button
            type="button"
            onClick={async () => {
              await logout();
              onLogout();
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            {user?.salon_name ? `Sign out (${user.salon_name})` : "Sign out"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100 p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-white text-violet-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className={`mt-6 ${tab === "batch" ? "" : "hidden"}`}>
          <UploadForm onSubmit={handleSubmit} submitting={submitting} />

          {submitError && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {submitError}
            </p>
          )}
          {submitNotice && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{submitNotice}</p>
          )}

          <JobStatus job={job} cancelling={cancelling} onCancel={handleCancel} />

          <RecentBatchJobs onSelectJob={setJob} />
        </div>

        <div className={`mt-6 ${tab === "edit" ? "" : "hidden"}`}>
          <PhotoEditor />
        </div>

        <div className={`mt-6 ${tab === "social" ? "" : "hidden"}`}>
          <SocialScheduling />
        </div>

        <div className={`mt-6 ${tab === "campaigns" ? "" : "hidden"}`}>
          <CampaignManager />
        </div>

        <div className={`mt-6 ${tab === "dashboard" ? "" : "hidden"}`}>
          <Dashboard />
        </div>
      </main>
    </div>
  );
}

export default App;
