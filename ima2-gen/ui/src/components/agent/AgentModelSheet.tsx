import { useCallback } from "react";
import { useI18n } from "../../i18n";
import { AgentModelSelector } from "./AgentModelSelector";
import { CloseIcon } from "./AgentIcons";
import { useAgentDialogFocus } from "./useAgentDialogFocus";
import type { AgentGenerationSettings } from "./agentTypes";

type Props = {
  open: boolean;
  settings: AgentGenerationSettings;
  onSettingsChange: (patch: Partial<AgentGenerationSettings>) => void;
  onClose: () => void;
};

export function AgentModelSheet({ open, settings, onSettingsChange, onClose }: Props) {
  const { t } = useI18n();
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useAgentDialogFocus(open, close);
  if (!open) return null;

  return (
    <div className="agent-dialog agent-dialog--model" role="presentation">
      <button type="button" className="agent-dialog__backdrop" onClick={onClose} aria-label={t("agent.closeModelSettings")} />
      <section ref={panelRef} className="agent-model-sheet" role="dialog" aria-modal="true" aria-label={t("agent.modelSettings")}>
        <header>
          <strong>{t("agent.modelSettings")}</strong>
          <button type="button" onClick={onClose} aria-label={t("agent.closeModelSettings")}>
            <CloseIcon size={17} />
          </button>
        </header>
        <AgentModelSelector settings={settings} onChange={onSettingsChange} />
      </section>
    </div>
  );
}
