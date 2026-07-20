import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";

export function GenerateButton() {
  const activeGenerations = useAppStore((s) => s.activeGenerations);
  const generate = useAppStore((s) => s.generate);
  const openReadinessPopup = useAppStore((s) => s.openReadinessPopup);
  const { t } = useI18n();

  const loading = activeGenerations > 0;

  return (
    <div className="generate-row">
      <button
        type="button"
        className={`generate-btn foil-hover${loading ? " generate-btn--active" : ""}`}
        onClick={() => void generate()}
      >
        {t("generate.button")}
        {loading ? (
          <span className="generate-btn__count" aria-label={t("generate.buttonLoading", { n: activeGenerations })}>
            {activeGenerations}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="generate-row__readiness"
        onClick={openReadinessPopup}
        title={t("readiness.openTitle")}
        aria-label={t("readiness.openTitle")}
      >
        ?
      </button>
    </div>
  );
}
