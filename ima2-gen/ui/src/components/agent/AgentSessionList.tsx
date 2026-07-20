import { useI18n } from "../../i18n";
import { EditIcon, ImageIcon, TrashIcon } from "./AgentIcons";
import { AgentSafeImage } from "./AgentSafeImage";
import { AgentSessionSpinner } from "./AgentSessionSpinner";
import type { AgentImageHandle, AgentSessionRunSummary, AgentSessionSummary } from "./agentTypes";

type Props = {
  sessions: AgentSessionSummary[];
  selectedId: string;
  imagesById: Record<string, AgentImageHandle>;
  runSummaryBySession?: Record<string, AgentSessionRunSummary>;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

function formatUpdatedAt(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function AgentSessionList({ sessions, selectedId, imagesById, runSummaryBySession = {}, onSelect, onRename, onDelete }: Props) {
  const { t } = useI18n();

  return (
    <div className="agent-session-list">
      {sessions.map((session) => {
        const image = session.lastImageId ? imagesById[session.lastImageId] : null;
        return (
          <div key={session.id} className={`agent-session-row${session.id === selectedId ? " is-active" : ""}`}>
            <button type="button" aria-current={session.id === selectedId ? "page" : undefined} onClick={() => onSelect(session.id)}>
              <span className="agent-session-row__thumb">
                {image ? <AgentSafeImage src={image.thumbUrl ?? image.url} alt="" iconSize={17} /> : <ImageIcon size={17} />}
              </span>
              <span className="agent-session-row__body">
                <strong>{session.title}</strong>
                <span>
                  {t("agent.imageCount", { count: session.imageCount })} · {formatUpdatedAt(session.updatedAt)}
                </span>
              </span>
	              <span className="agent-session-row__badges">
	                <AgentSessionSpinner summary={runSummaryBySession[session.id]} />
	                {session.webSearchEnabled ? <em title={t("agent.web")}>W</em> : null}
                {session.compacted ? <em title={t("agent.compacted")}>C</em> : null}
              </span>
            </button>
            <div className="agent-session-row__actions">
              <button type="button" onClick={() => onRename(session.id)} aria-label={t("agent.renameSession")} title={t("agent.renameSession")}>
                <EditIcon size={14} />
              </button>
              <button type="button" onClick={() => onDelete(session.id)} aria-label={t("agent.deleteSession")} title={t("agent.deleteSession")}>
                <TrashIcon size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
