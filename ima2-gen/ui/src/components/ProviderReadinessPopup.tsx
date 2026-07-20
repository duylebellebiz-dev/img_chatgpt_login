import { useI18n } from "../i18n";
import { IMAGE_MODEL_OPTIONS } from "../lib/imageModels";
import { useAppStore } from "../store/useAppStore";
import { useProviderAvailability } from "./ProviderSelect";
import { useModalFocus } from "../hooks/useModalFocus";

export function ProviderReadinessPopup() {
  const { t } = useI18n();
  const open = useAppStore((s) => s.readinessPopupOpen);
  const close = useAppStore((s) => s.closeReadinessPopup);
  const openSettings = useAppStore((s) => s.openSettings);
  const provider = useAppStore((s) => s.provider);
  const imageModel = useAppStore((s) => s.imageModel);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const webSearchEnabled = useAppStore((s) => s.webSearchEnabled);
  const availability = useProviderAvailability();
  const isGrok = provider === "grok";
  const imageModelOption = IMAGE_MODEL_OPTIONS.find((option) => option.value === imageModel);
  const modalRef = useModalFocus<HTMLDivElement>(open, close);

  if (!open) return null;
  const current = availability[provider];
  const ready = current.ok;

  const goAccount = () => {
    close();
    openSettings("providers");
  };

  return (
    <div className="modal-backdrop provider-readiness-backdrop" onClick={close} role="presentation">
      <div
        ref={modalRef}
        className="modal provider-readiness"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-readiness-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div id="provider-readiness-title" className="modal__title">
          {t("readiness.title")}
        </div>
        <div className="modal__body provider-readiness__body">
          <div className={`provider-readiness__status${ready ? " is-ok" : " is-blocked"}`}>
            <span aria-hidden="true" />
            <strong>{ready ? t("readiness.ready") : t("readiness.blocked")}</strong>
            <small>{ready ? t("readiness.readyBody") : current.reason}</small>
          </div>
          {current.hint ? <p className="modal__hint">{current.hint}</p> : null}
          <dl className="provider-readiness__facts">
            <div>
              <dt>{t("readiness.provider")}</dt>
              <dd>{provider === "agy" ? "Gemini" : provider === "grok" ? "Grok OAuth" : provider === "oauth" ? "GPT OAuth" : "GPT API"}</dd>
            </div>
            <div>
              <dt>{t("readiness.model")}</dt>
              <dd>{imageModelOption ? t(imageModelOption.fullLabelKey) : imageModel}</dd>
            </div>
            {isGrok ? (
              <div>
                <dt>{t("readiness.grokApi")}</dt>
                <dd>{t("readiness.grokApiBody")}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>{t("readiness.reasoning")}</dt>
                  <dd>{reasoningEffort}</dd>
                </div>
                <div>
                  <dt>{t("readiness.webSearch")}</dt>
                  <dd>{webSearchEnabled ? t("settings.webSearch.on") : t("settings.webSearch.off")}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
        <div className="modal__actions">
          <button type="button" className="modal__btn modal__btn--secondary" onClick={close} data-modal-initial-focus>
            {t("common.close")}
          </button>
          <button type="button" className="modal__btn" onClick={goAccount}>
            {t("readiness.openAccount")}
          </button>
        </div>
      </div>
    </div>
  );
}
