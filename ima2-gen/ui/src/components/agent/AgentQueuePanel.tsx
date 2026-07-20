import { useI18n } from "../../i18n";
import { AgentQueueRow } from "./AgentQueueRow";
import type { AgentQueueItem, AgentSessionRunSummary } from "./agentTypes";

type Props = {
  items: AgentQueueItem[];
  summary?: AgentSessionRunSummary;
  onCancel: (itemId: string) => void;
  onRetry: (itemId: string) => void;
};

export function AgentQueuePanel({ items, summary, onCancel, onRetry }: Props) {
  const { t } = useI18n();
  const announcement = t("agent.queueAnnouncement", {
    running: summary?.runningCount ?? 0,
    queued: summary?.queuedCount ?? 0,
    failed: items.filter((item) => item.status === "failed").length,
  });

  return (
    <section className="agent-sidebar-section" aria-label={t("agent.queue")}>
      <header>
        <div>
          <span>{t("agent.queue")}</span>
          <strong>
            {summary?.runningCount ?? 0} {t("agent.runningShort")} · {summary?.queuedCount ?? 0} {t("agent.queuedShort")}
          </strong>
        </div>
      </header>
      <div className="agent-queue-list">
        <span className="agent-sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
        {items.length === 0 ? (
          <div className="agent-tab-empty">{t("agent.queueEmpty")}</div>
        ) : (
          items.map((item) => (
            <AgentQueueRow key={item.id} item={item} onCancel={onCancel} onRetry={onRetry} />
          ))
        )}
      </div>
    </section>
  );
}
