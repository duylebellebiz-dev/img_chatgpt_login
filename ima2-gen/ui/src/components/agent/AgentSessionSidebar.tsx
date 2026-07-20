import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { SidebarChrome } from "../Sidebar";
import { MenuIcon, PlusIcon, SearchIcon } from "./AgentIcons";
import { AgentSessionList } from "./AgentSessionList";
import type { AgentGenerationSettings, AgentImageHandle, AgentSessionRunSummary, AgentSessionSummary } from "./agentTypes";

type Props = {
  sessions: AgentSessionSummary[];
  selectedId: string;
  imagesById: Record<string, AgentImageHandle>;
  runSummaryBySession?: Record<string, AgentSessionRunSummary>;
  settings: AgentGenerationSettings;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSettingsChange: (patch: Partial<AgentGenerationSettings>) => void;
  panePreference: "expanded" | "rail";
  onPanePreferenceChange: (preference: "expanded" | "rail") => void;
};

export function AgentPanePreference({ preference, onChange }: { preference: "expanded" | "rail"; onChange: (preference: "expanded" | "rail") => void }) {
  const { t } = useI18n();
  const next = preference === "expanded" ? "rail" : "expanded";
  return (
    <button
      type="button"
      className="agent-pane-preference"
      aria-pressed={preference === "expanded"}
      aria-label={t(preference === "expanded" ? "agent.sessionsUseRail" : "agent.sessionsUseExpanded")}
      title={t(preference === "expanded" ? "agent.sessionsUseRail" : "agent.sessionsUseExpanded")}
      onClick={() => onChange(next)}
    >
      <MenuIcon size={15} />
    </button>
  );
}

export function AgentSessionSidebar(props: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return props.sessions;
    return props.sessions.filter((session) => session.title.toLowerCase().includes(normalized));
  }, [props.sessions, query]);

  return (
    <aside className="sidebar agent-session-sidebar" aria-label={t("agent.sessions")}>
      <div className="sidebar__scroll">
        <SidebarChrome agentSettings={props.settings} onAgentSettingsChange={props.onSettingsChange} />
        <section className="agent-sessions" aria-label={t("agent.sessions")}>
          <header className="agent-sessions__header">
            <strong>{t("agent.sessions")}</strong>
            <AgentPanePreference preference={props.panePreference} onChange={props.onPanePreferenceChange} />
          </header>
          <button type="button" className="agent-sessions__create" onClick={props.onCreate}>
            <PlusIcon size={16} />
            <span>{t("agent.newSession")}</span>
          </button>
          <label className="agent-sessions__search">
            <SearchIcon size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("agent.sessionSearch")} />
          </label>
          <AgentSessionList {...props} sessions={filtered} />
        </section>
      </div>
    </aside>
  );
}
