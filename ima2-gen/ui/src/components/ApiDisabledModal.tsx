import { useI18n } from "../i18n";
import { useModalFocus } from "../hooks/useModalFocus";

type Props = {
  open: boolean;
  providerLabel: string;
  reason: string;
  hint?: string;
  onClose: () => void;
};

export function ApiDisabledModal({ open, providerLabel, reason, hint, onClose }: Props) {
  const { t } = useI18n();
  const modalRef = useModalFocus<HTMLDivElement>(open, onClose);

  if (!open) return null;
  const title = t("apiDisabled.title", { provider: providerLabel });
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__title">{title}</div>
        <div className="modal__body">
          <p>{reason}</p>
          {hint ? <p className="modal__hint">{hint}</p> : null}
        </div>
        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onClose} data-modal-initial-focus>
            {t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
