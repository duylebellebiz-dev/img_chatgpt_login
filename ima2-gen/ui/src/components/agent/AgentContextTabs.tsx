import { useI18n } from "../../i18n";
import type { AgentContextTab } from "./agentTypes";

type Props = {
  activeTab: AgentContextTab;
  onChange: (tab: AgentContextTab) => void;
};

const TABS: AgentContextTab[] = ["image", "refs", "web", "memory"];

export function AgentContextTabs({ activeTab, onChange }: Props) {
  const { t } = useI18n();
  const labels: Record<AgentContextTab, string> = {
    image: t("agent.imageTab"),
    refs: t("agent.refsTab"),
    web: t("agent.webTab"),
    memory: t("agent.memoryTab"),
  };

  return (
    <div className="agent-context-tabs" role="tablist" aria-label={t("agent.contextTabs")}>
      {TABS.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => onChange(tab)}>
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
