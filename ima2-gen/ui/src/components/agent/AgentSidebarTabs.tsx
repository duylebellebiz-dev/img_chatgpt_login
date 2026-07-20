import { useI18n } from "../../i18n";
import type { AgentSidebarTab } from "./agentTypes";

type Props = {
  activeTab: AgentSidebarTab;
  onChange: (tab: AgentSidebarTab) => void;
};

const TABS: AgentSidebarTab[] = ["image", "library", "forms", "quality", "model", "queue"];

export function AgentSidebarTabs({ activeTab, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="agent-sidebar-tabs" role="tablist" aria-label={t("agent.rightSidebar")}>
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`agent-sidebar-tab-${tab}`}
          aria-controls={`agent-sidebar-panel-${tab}`}
          className={activeTab === tab ? "active" : ""}
          aria-selected={activeTab === tab}
          onClick={() => onChange(tab)}
        >
          {t(`agent.sidebarTabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}
