import { useI18n } from "../../i18n";
import { AgentModelSelector } from "./AgentModelSelector";
import { AgentQualityPanel } from "./AgentQualityPanel";
import type { AgentGenerationSettings } from "./agentTypes";

type Props = {
  settings: AgentGenerationSettings;
  onChange: (patch: Partial<AgentGenerationSettings>) => void;
};

export function AgentGenerationSettingsPanel({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-sidebar-section" aria-label={t("agent.modelSettings")}>
      <header>
        <div>
          <span>{t("agent.modelSettings")}</span>
          <strong>{settings.model}</strong>
        </div>
      </header>
      <AgentModelSelector settings={settings} onChange={onChange} />
      <AgentQualityPanel settings={settings} onChange={onChange} />
    </section>
  );
}
