export default function PromptTemplates({ templates, onSelect, label = "Mẫu prompt nhanh" }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.text}
            onClick={() => onSelect(t.text)}
            className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
