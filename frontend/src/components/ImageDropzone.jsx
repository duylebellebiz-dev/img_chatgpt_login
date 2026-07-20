import { useEffect, useMemo, useRef, useState } from "react";
import { TrashIcon, UploadIcon } from "./icons";

export default function ImageDropzone({ label, hint, multiple = false, files, onChange }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews]);

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    onChange(multiple ? [...files, ...incoming] : [incoming[0]]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  function removeAt(index) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-900">{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragActive ? "border-violet-400 bg-violet-50" : "border-neutral-300 bg-neutral-50 hover:border-violet-300 hover:bg-violet-50/40"
        }`}
      >
        <UploadIcon className="h-6 w-6 text-neutral-400" />
        <p className="mt-2 text-sm text-neutral-600">
          <span className="font-medium text-violet-600">Click to upload</span> or drag and drop
        </p>
        {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {previews.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <div key={`${p.file.name}-${i}`} className="group relative h-16 w-16 overflow-hidden border border-neutral-200 bg-white">
              <img src={p.url} alt={p.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Remove ${p.file.name}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
