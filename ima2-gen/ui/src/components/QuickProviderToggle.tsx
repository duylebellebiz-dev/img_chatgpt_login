import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useProviderAvailability } from "./ProviderSelect";
import { ApiDisabledModal } from "./ApiDisabledModal";
import { useI18n } from "../i18n";
import type { Provider } from "../types";

const GEMINI_FAMILY: Provider[] = ["agy", "gemini-api"];
const GPT_FAMILY: Provider[] = ["oauth", "api"];

type BlockedInfo = { label: string; reason: string; hint?: string };

export function QuickProviderToggle() {
  const { t } = useI18n();
  const provider = useAppStore((s) => s.provider);
  const setProvider = useAppStore((s) => s.setProvider);
  const availability = useProviderAvailability();
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null);

  const isGeminiActive = GEMINI_FAMILY.includes(provider);
  const isGptActive = GPT_FAMILY.includes(provider);

  const switchFamily = (family: "gemini" | "gpt") => {
    if (family === "gemini" ? isGeminiActive : isGptActive) return;
    const target: Provider =
      family === "gemini"
        ? availability.agy.ok
          ? "agy"
          : "gemini-api"
        : availability.oauth.ok
          ? "oauth"
          : "api";
    if (!availability[target].ok) {
      setBlocked({
        label: family === "gemini" ? "Gemini" : "GPT",
        reason: availability[target].reason,
        hint: availability[target].hint,
      });
      return;
    }
    setProvider(target);
  };

  return (
    <>
      <div className="quick-provider-toggle" role="group" aria-label={t("provider.authTitle")}>
        <button
          type="button"
          className={`quick-provider-toggle__btn${isGeminiActive ? " active" : ""}`}
          onClick={() => switchFamily("gemini")}
          aria-pressed={isGeminiActive}
          title="Gemini"
        >
          Gemini
        </button>
        <button
          type="button"
          className={`quick-provider-toggle__btn${isGptActive ? " active" : ""}`}
          onClick={() => switchFamily("gpt")}
          aria-pressed={isGptActive}
          title="GPT"
        >
          GPT
        </button>
      </div>
      <ApiDisabledModal
        open={!!blocked}
        providerLabel={blocked?.label ?? ""}
        reason={blocked?.reason ?? ""}
        hint={blocked?.hint}
        onClose={() => setBlocked(null)}
      />
    </>
  );
}
