import { useEffect, useRef, useState } from "react";
import { cancelEditBatchJob, createEditBatchJob, getEditBatchJob } from "../api";
import EditJobStatus from "./EditJobStatus";
import ImageDropzone from "./ImageDropzone";
import LogoUploader from "./LogoUploader";
import PromptTemplates from "./PromptTemplates";
import SizeSelector from "./SizeSelector";
import { AlertIcon, SparklesIcon, Spinner } from "./icons";

const IMAGE_PROVIDERS = [
  { value: "agy", label: "Gemini", help: "Free via Antigravity CLI OAuth." },
  { value: "gpt", label: "ChatGPT", help: "Free via ChatGPT OAuth (requires ima2 serve running)." },
  { value: "gemini_api", label: "Gemini API", help: "Billed API key. Generates each image instantly." },
  { value: "gemini_batch_api", label: "Gemini Batch API", help: "~50% cheaper, same key — slower, not instant." },
];

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const MAX_POLL_ERRORS = 3;

const EDIT_PROMPT_TEMPLATES = [
  {
    label: "Đổi nhẹ mẫu nail",
    text: "Make the nail design different from the original image a little bit, keep everything else exactly the same.",
  },
  {
    label: "Giữ nguyên nền ảnh",
    text: "Keep the background of the original image exactly the same, do not change it.",
  },
  {
    label: "Tăng sáng & làm nét",
    text: "Increase the brightness and sharpen the image to make it look clearer and more vivid.",
  },
  {
    label: "Đổi màu sơn nail",
    text: "Change the nail polish color, keep the same nail shape and design.",
  },
  {
    label: "Nền chụp chuyên nghiệp",
    text: "Replace the background with a clean, minimalist, high-end commercial photography background.",
  },
  {
    label: "Ánh sáng studio",
    text: "Adjust the lighting to look like professional studio photography with soft, natural light.",
  },
  {
    label: "Làm mịn da tay",
    text: "Smooth and retouch the skin on the hand naturally, without changing the hand shape or nail design.",
  },
  {
    label: "Xóa vật thể thừa",
    text: "Remove any distracting objects or clutter from the background, keep the hand and nails unchanged.",
  },
  {
    label: "Phong cách sang trọng",
    text: "Give the image a luxury, high-end nail salon aesthetic.",
  },
  {
    label: "Giữ nguyên dáng tay",
    text: "Keep the exact same hand shape, pose, and finger position, only change what is described above.",
  },
];

export default function PhotoEditor() {
  const [images, setImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState({ width: 1080, height: 1350 });
  const [provider, setProvider] = useState("agy");
  const [logoUrl, setLogoUrl] = useState(null);
  const [applyLogo, setApplyLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);
  const pollErrorCountRef = useRef(0);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  function handleTemplateSelect(text) {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
      return `${trimmed}${separator}${text}`;
    });
  }

  function handleLogoChange(url) {
    setLogoUrl(url);
    if (!url) setApplyLogo(false);
    else setApplyLogo(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (images.length === 0) return setError("Upload at least one photo to edit.");
    if (!prompt.trim()) return setError("Describe how you want the photos edited.");

    setSubmitting(true);
    setJob(null);
    clearInterval(pollRef.current);
    pollErrorCountRef.current = 0;

    try {
      const created = await createEditBatchJob({
        images,
        prompt,
        imageWidth: size.width,
        imageHeight: size.height,
        applyLogo,
        provider,
      });
      const jobId = created.job_id;

      const poll = async () => {
        try {
          const status = await getEditBatchJob(jobId);
          pollErrorCountRef.current = 0;
          setJob(status);
          if (TERMINAL_STATUSES.has(status.status)) {
            clearInterval(pollRef.current);
          }
        } catch (err) {
          pollErrorCountRef.current += 1;
          if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
            setError(err.message);
            clearInterval(pollRef.current);
          }
        }
      };

      await poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(jobId) {
    setCancelling(true);
    setError(null);
    try {
      await cancelEditBatchJob(jobId);
      clearInterval(pollRef.current);
      const status = await getEditBatchJob(jobId);
      setJob(status);
      setNotice("Batch photo editing was cancelled.");
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <LogoUploader onLogoChange={handleLogoChange} />

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">AI Photo Editor</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Upload one or more photos and describe the edit you want — Claude sharpens the instruction, then your
            chosen provider applies it to every photo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <ImageDropzone label="Photos" hint="PNG or JPG, upload multiple" multiple files={images} onChange={setImages} />

          <div>
            <label className="block text-sm font-medium text-neutral-900">Image provider</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {IMAGE_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    provider === p.value
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-neutral-300 text-neutral-700 hover:border-neutral-400"
                  }`}
                >
                  {p.label}
                  <span className="mt-0.5 block text-xs font-normal text-neutral-500">{p.help}</span>
                </button>
              ))}
            </div>
          </div>

          <SizeSelector onChange={setSize} />

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-900">Edit instruction</label>
              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  className="text-xs font-medium text-neutral-400 hover:text-neutral-600"
                >
                  Xóa
                </button>
              )}
            </div>
            <textarea
              className="mt-1.5 w-full rounded-lg border border-neutral-300 p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              rows={2}
              placeholder="e.g. change the nail color to a glossy red, keep everything else the same"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="mt-2.5">
              <PromptTemplates templates={EDIT_PROMPT_TEMPLATES} onSelect={handleTemplateSelect} />
            </div>
          </div>

          {logoUrl && (
            <label className="flex items-center gap-2.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={applyLogo}
                onChange={(e) => setApplyLogo(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500/40"
              />
              Watermark results with the salon logo
            </label>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                Edit {images.length > 1 ? `${images.length} Photos` : "Photo"}
              </>
            )}
          </button>
        </form>
      </div>

      <EditJobStatus job={job} cancelling={cancelling} onCancel={handleCancel} />
    </div>
  );
}
