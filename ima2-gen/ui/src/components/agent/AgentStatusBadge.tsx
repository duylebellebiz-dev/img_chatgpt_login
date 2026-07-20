import { useI18n } from "../../i18n";
import type { AgentRuntimeStatus } from "./agentTypes";

type Props = {
  status: AgentRuntimeStatus;
  compacted?: boolean;
};

export function AgentStatusBadge({ status, compacted = false }: Props) {
  const { t } = useI18n();
  const label =
    status === "generating"
      ? t("agent.statusGenerating")
      : status === "reconnecting"
        ? t("agent.statusReconnecting")
        : t("agent.statusReady");

  return (
    <span className={`agent-status agent-status--${status}`} aria-live={status === "ready" ? undefined : "polite"}>
      {status === "generating" ? <span className="agent-status__dot" aria-hidden="true" /> : null}
      <span>{label}</span>
      {compacted ? <em>{t("agent.compacted")}</em> : null}
    </span>
  );
}
