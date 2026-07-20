import { useCallback } from "react";
import { useI18n } from "../../i18n";
import { AgentQueuePanel } from "./AgentQueuePanel";
import { CloseIcon } from "./AgentIcons";
import { useAgentDialogFocus } from "./useAgentDialogFocus";
import type { AgentQueueItem, AgentSessionRunSummary } from "./agentTypes";

type Props = {
  open: boolean;
  items: AgentQueueItem[];
  summary?: AgentSessionRunSummary;
  onCancel: (itemId: string) => void;
  onRetry: (itemId: string) => void;
  onClose: () => void;
};

export function AgentQueueSheet({ open, items, summary, onCancel, onRetry, onClose }: Props) {
  const { t } = useI18n();
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useAgentDialogFocus(open, close);
  if (!open) return null;

  return (
    <div className="agent-dialog agent-dialog--queue" role="presentation">
      <button type="button" className="agent-dialog__backdrop" onClick={onClose} aria-label={t("agent.topbarCloseQueue")} />
      <section ref={panelRef} className="agent-queue-sheet" role="dialog" aria-modal="true" aria-label={t("agent.topbarQueueSheet")}>
        <header>
          <strong>{t("agent.topbarQueueSheet")}</strong>
          <button type="button" onClick={onClose} aria-label={t("agent.topbarCloseQueue")}>
            <CloseIcon size={17} />
          </button>
        </header>
        <AgentQueuePanel items={items} summary={summary} onCancel={onCancel} onRetry={onRetry} />
      </section>
    </div>
  );
}
