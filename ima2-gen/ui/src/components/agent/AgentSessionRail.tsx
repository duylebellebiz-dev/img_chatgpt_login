import { useI18n } from "../../i18n";
import { ImageIcon, MenuIcon, PlusIcon } from "./AgentIcons";
import { AgentSafeImage } from "./AgentSafeImage";
import { AgentSessionSpinner } from "./AgentSessionSpinner";
import type { AgentImageHandle, AgentSessionRunSummary, AgentSessionSummary } from "./agentTypes";

type Props = {
  sessions: AgentSessionSummary[];
  selectedId: string;
  imagesById: Record<string, AgentImageHandle>;
  runSummaryBySession?: Record<string, AgentSessionRunSummary>;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onOpenDrawer: () => void;
};

export function AgentSessionRail({ sessions, selectedId, imagesById, runSummaryBySession = {}, onCreate, onSelect, onOpenDrawer }: Props) {
  const { t } = useI18n();

  return (
    <aside className="agent-rail" aria-label={t("agent.sessions")}>
      <button type="button" onClick={onOpenDrawer} aria-label={t("agent.openSessions")} title={t("agent.openSessions")}>
        <MenuIcon size={17} />
      </button>
      <button type="button" onClick={onCreate} aria-label={t("agent.newSession")} title={t("agent.newSession")}>
        <PlusIcon size={17} />
      </button>
      <div className="agent-rail__sessions">
        {sessions.map((session) => {
          const image = session.lastImageId ? imagesById[session.lastImageId] : null;
          return (
            <button key={session.id} type="button" className={session.id === selectedId ? "is-active" : ""} onClick={() => onSelect(session.id)} title={session.title}>
	              {image ? <AgentSafeImage src={image.thumbUrl ?? image.url} alt="" iconSize={17} /> : <ImageIcon size={17} />}
	              <AgentSessionSpinner summary={runSummaryBySession[session.id]} />
	              {session.compacted ? <span aria-label={t("agent.compacted")} /> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
