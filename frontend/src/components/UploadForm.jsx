import { useEffect, useState } from "react";
import ImageDropzone from "./ImageDropzone";
import PromptTemplates from "./PromptTemplates";
import SizeSelector from "./SizeSelector";
import { SparklesIcon, Spinner } from "./icons";
import { listCampaigns } from "../api";

const DESCRIPTION_TEMPLATES = [
  { label: "Sang trọng mùa hè", text: "summer luxury nail design" },
  {
    label: "Tối giản, pastel",
    text: "minimalist elegant nail art, soft pastel colors",
  },
  {
    label: "Đỏ bóng, studio",
    text: "bold glossy red nail design, commercial studio photography",
  },
  {
    label: "French tip tự nhiên",
    text: "French tip nail design, natural light, clean background",
  },
  {
    label: "Ánh vàng sang trọng",
    text: "trendy nail art with gold accents, luxury salon style",
  },
  {
    label: "Tối giản Hàn Quốc",
    text: "Korean minimalist nail art, soft nude tones, clean white background",
  },
];

const DETAIL_PROMPT_TEMPLATES = [
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
    text: "Use the exact hand pose from the hand pose reference image, keep the same finger position and framing.",
  },
  {
    label: "Không giống dáng tay mẫu nail",
    text: "The hand pose in the generated image must come from the hand pose reference image only — do not copy or resemble the hand pose shown in the nail design reference image.",
  },
];

const PAIRING_MODES = [
  { value: "cross", label: "Cross Pair", help: "Every design × every pose combination." },
  { value: "random", label: "Random Pair", help: "Randomly pairs designs with poses." },
  { value: "one_to_one", label: "One-to-One", help: "Pairs each design with one pose, in order." },
];

function getOutputPreview(designCount, poseCount, pairingMode, requestedCount) {
  if (designCount < 1 || poseCount < 1 || !Number.isInteger(requestedCount) || requestedCount < 1) {
    return null;
  }

  const basePairs = Math.min(designCount, poseCount);
  const safeLimit = basePairs * 2;
  const extendedLimit = Math.min(designCount * poseCount, basePairs * 3);
  const hardLimit = designCount * poseCount;

  const modeLimit =
    pairingMode === "one_to_one" ? safeLimit : pairingMode === "random" ? extendedLimit : hardLimit;
  const approvedCount = Math.min(requestedCount, modeLimit, 100);

  return { approvedCount, modeLimit };
}

export default function UploadForm({ onSubmit, submitting }) {
  const [designImages, setDesignImages] = useState([]);
  const [poseImages, setPoseImages] = useState([]);
  const [pairingMode, setPairingMode] = useState("cross");
  const [numImages, setNumImages] = useState(20);
  const [description, setDescription] = useState("summer luxury nail design");
  const [size, setSize] = useState({ width: 1080, height: 1350 });
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState(null);
  const outputPreview = getOutputPreview(designImages.length, poseImages.length, pairingMode, numImages);
  const activeMode = PAIRING_MODES.find((m) => m.value === pairingMode);

  useEffect(() => {
    listCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    if (outputPreview && numImages > outputPreview.modeLimit) {
      setNumImages(outputPreview.modeLimit);
    }
  }, [numImages, outputPreview]);

  function handleTemplateSelect(text) {
    setDescription((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      const separator = /[.!?]$/.test(trimmed) ? " " : ", ";
      return `${trimmed}${separator}${text}`;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (designImages.length === 0) return setError("Upload at least one nail design image.");
    if (poseImages.length === 0) return setError("Upload at least one hand pose image.");
    if (!Number.isInteger(numImages) || numImages < 1 || numImages > 100) {
      return setError("Number of images must be an integer between 1 and 100.");
    }
    if (outputPreview && numImages > outputPreview.modeLimit) {
      return setError(`This input set supports up to ${outputPreview.modeLimit} image(s) in ${pairingMode} mode.`);
    }

    onSubmit({
      designImages,
      poseImages,
      pairingMode,
      numImages,
      description,
      imageWidth: size.width,
      imageHeight: size.height,
      campaignId: campaignId || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Batch Image Generator
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Upload nail designs + hand poses and generate a full campaign of
          on-brand product photos in one go.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-neutral-900">
            Campaign description
          </label>
          {description && (
            <button
              type="button"
              onClick={() => setDescription("")}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-600"
            >
              Xóa
            </button>
          )}
        </div>
        <textarea
          className="mt-1.5 w-full rounded-lg border border-neutral-300 p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. summer luxury nail design"
        />
        <div className="mt-2.5">
          <PromptTemplates
            label="Phong cách chiến dịch"
            templates={DESCRIPTION_TEMPLATES}
            onSelect={handleTemplateSelect}
          />
        </div>
        <div className="mt-2.5">
          <PromptTemplates
            label="Yêu cầu chi tiết khi tạo ảnh"
            templates={DETAIL_PROMPT_TEMPLATES}
            onSelect={handleTemplateSelect}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ImageDropzone
          label={`Hand pose images  (${designImages.length})`}
          hint="PNG or JPG, one or more"
          multiple
          files={designImages}
          onChange={setDesignImages}
        />
        <ImageDropzone
          label={`Nail design images (${poseImages.length})`}
          hint="PNG or JPG, one or more"
          multiple
          files={poseImages}
          onChange={setPoseImages}
        />
      </div>

      <SizeSelector onChange={setSize} />

      {campaigns.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-neutral-900">Campaign (optional)</label>
          <select
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">No campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-900">
            Pairing mode
          </label>
          <select
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            value={pairingMode}
            onChange={(e) => setPairingMode(e.target.value)}
          >
            {PAIRING_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {activeMode && (
            <p className="mt-1.5 text-xs text-neutral-500">{activeMode.help}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-900">
            Number of images (1-100)
          </label>
          <input
            type="number"
            min={1}
            max={outputPreview?.modeLimit ?? 100}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            value={numImages}
            onChange={(e) => {
              const nextValue = parseInt(e.target.value, 10);
              if (Number.isNaN(nextValue)) {
                setNumImages(1);
                return;
              }
              setNumImages(
                outputPreview
                  ? Math.min(nextValue, outputPreview.modeLimit)
                  : nextValue,
              );
            }}
          />
          {outputPreview && (
            <p className="mt-1.5 text-xs text-neutral-500">
              Up to {outputPreview.modeLimit} image(s) possible with this input
              in {pairingMode} mode.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Spinner className="h-4 w-4 animate-spin" />
            Starting batch...
          </>
        ) : (
          <>
            <SparklesIcon className="h-4 w-4" />
            Generate Batch
          </>
        )}
      </button>
    </form>
  );
}
