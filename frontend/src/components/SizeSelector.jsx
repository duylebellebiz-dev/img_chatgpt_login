import { useEffect, useState } from "react";

const TEMPLATES = [
  { key: "post", label: "Post", sub: "1080 × 1350", width: 1080, height: 1350, ratioW: 4, ratioH: 5 },
  { key: "story", label: "Story/Reels", sub: "1080 × 1920", width: 1080, height: 1920, ratioW: 9, ratioH: 16 },
  { key: "custom", label: "Custom", sub: "Set your own", ratioW: 1, ratioH: 1 },
];

function RatioGlyph({ ratioW, ratioH, active }) {
  const size = 28;
  const width = ratioW >= ratioH ? size : size * (ratioW / ratioH);
  const height = ratioH >= ratioW ? size : size * (ratioH / ratioW);
  return (
    <div className="flex h-8 items-center justify-center">
      <div
        className={`rounded-[3px] border-2 ${active ? "border-violet-500" : "border-neutral-300"}`}
        style={{ width, height }}
      />
    </div>
  );
}

export default function SizeSelector({ onChange }) {
  const [selected, setSelected] = useState("post");
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1350);

  useEffect(() => {
    const template = TEMPLATES.find((t) => t.key === selected);
    if (selected === "custom") {
      onChange({ width: customWidth || null, height: customHeight || null });
    } else {
      onChange({ width: template.width, height: template.height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, customWidth, customHeight]);

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-900">Image size</label>
      <div className="mt-1.5 grid grid-cols-3 gap-2.5">
        {TEMPLATES.map((t) => {
          const active = selected === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSelected(t.key)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors ${
                active ? "border-violet-500 bg-violet-50" : "border-neutral-200 bg-white hover:border-neutral-300"
              }`}
            >
              <RatioGlyph ratioW={t.ratioW} ratioH={t.ratioH} active={active} />
              <div>
                <p className={`text-sm font-medium ${active ? "text-violet-700" : "text-neutral-900"}`}>{t.label}</p>
                <p className="text-xs text-neutral-500">
                  {t.key === "custom" && selected === "custom" && customWidth && customHeight
                    ? `${customWidth} × ${customHeight}`
                    : t.sub}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {selected === "custom" && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="number"
            min={256}
            max={4096}
            value={customWidth}
            onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 0)}
            placeholder="Width (px)"
            className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <span className="text-sm text-neutral-400">×</span>
          <input
            type="number"
            min={256}
            max={4096}
            value={customHeight}
            onChange={(e) => setCustomHeight(parseInt(e.target.value, 10) || 0)}
            placeholder="Height (px)"
            className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <span className="text-xs text-neutral-400">256–4096px</span>
        </div>
      )}
    </div>
  );
}
