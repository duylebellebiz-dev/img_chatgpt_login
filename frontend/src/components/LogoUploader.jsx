import { useEffect, useState } from "react";
import { deleteLogo, getLogo, mediaUrl, uploadLogo } from "../api";
import { AlertIcon, Spinner, TrashIcon, UploadIcon } from "./icons";

export default function LogoUploader({ onLogoChange }) {
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLogo()
      .then((res) => {
        setLogoUrl(res.logo_url);
        onLogoChange?.(res.logo_url);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const res = await uploadLogo(file);
      setLogoUrl(res.logo_url);
      onLogoChange?.(res.logo_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await deleteLogo();
      setLogoUrl(null);
      onLogoChange?.(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">Salon logo</p>
          <p className="mt-0.5 text-xs text-neutral-500">Used to watermark the bottom-right corner of results.</p>
        </div>
        {loading ? (
          <Spinner className="h-4 w-4 animate-spin text-neutral-400" />
        ) : logoUrl ? (
          <div className="flex items-center gap-2.5">
            <img src={mediaUrl(logoUrl)} alt="Salon logo" className="h-10 w-10 rounded border border-neutral-200 bg-white object-contain" />
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="rounded-lg border border-neutral-200 p-2 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              aria-label="Remove salon logo"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-violet-300 hover:text-violet-700">
            <UploadIcon className="h-4 w-4" />
            {busy ? "Uploading..." : "Upload logo"}
            <input type="file" accept="image/*" onChange={handleFile} disabled={busy} className="hidden" />
          </label>
        )}
      </div>
      {error && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
