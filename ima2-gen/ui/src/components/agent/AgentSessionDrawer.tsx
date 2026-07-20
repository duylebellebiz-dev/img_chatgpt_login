import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { CloseIcon, PlusIcon, SearchIcon } from "./AgentIcons";
import { AgentSessionList } from "./AgentSessionList";
import { useAgentDialogFocus } from "./useAgentDialogFocus";
import type { AgentImageHandle, AgentSessionRunSummary, AgentSessionSummary } from "./agentTypes";

type Props = {
  open: boolean;
  sessions: AgentSessionSummary[];
  selectedId: string;
  imagesById: Record<string, AgentImageHandle>;
  runSummaryBySession?: Record<string, AgentSessionRunSummary>;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export function AgentSessionDrawer({ open, sessions, selectedId, imagesById, runSummaryBySession, onClose, onCreate, onSelect, onRename, onDelete }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useAgentDialogFocus(open, close);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? sessions.filter((session) => session.title.toLowerCase().includes(normalized)) : sessions;
  }, [query, sessions]);
  if (!open) return null;

  return (
    <div className="agent-dialog agent-dialog--drawer" role="presentation">
      <button type="button" className="agent-dialog__backdrop" onClick={onClose} aria-label={t("agent.closeSessions")} />
      <section ref={panelRef} className="agent-session-drawer" role="dialog" aria-modal="true" aria-label={t("agent.sessions")}>
        <header>
          <strong>{t("agent.sessions")}</strong>
          <button type="button" onClick={onClose} aria-label={t("agent.closeSessions")}>
            <CloseIcon size={17} />
          </button>
        </header>
        <button type="button" className="agent-sessions__create" onClick={onCreate}>
          <PlusIcon size={16} />
          <span>{t("agent.newSession")}</span>
        </button>
        <label className="agent-sessions__search">
          <SearchIcon size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("agent.sessionSearch")} />
        </label>
        <AgentSessionList sessions={filtered} selectedId={selectedId} imagesById={imagesById} runSummaryBySession={runSummaryBySession} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
      </section>
    </div>
  );
}
