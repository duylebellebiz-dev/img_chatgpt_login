import { useI18n } from "../../i18n";
import { PromptBuilderScopeBadge } from "./PromptBuilderScopeBadge";
import { PromptBuilderModelMenu } from "./PromptBuilderModelMenu";
import { PromptBuilderMessageList } from "./PromptBuilderMessageList";
import { PromptBuilderComposer } from "./PromptBuilderComposer";

type PromptBuilderPanelProps = {
  variant?: "panel" | "sidebar";
};

export function PromptBuilderPanel({ variant = "panel" }: PromptBuilderPanelProps) {
  const { t } = useI18n();

  return (
    <section
      className={`prompt-builder prompt-builder--${variant}`}
      aria-label={t("promptBuilder.title")}
    >
      <div className="prompt-builder__header">
        <div>
          <span className="section-title">{t("promptBuilder.title")}</span>
          <PromptBuilderScopeBadge />
        </div>
        <div className="prompt-builder__header-actions">
          <PromptBuilderModelMenu />
        </div>
      </div>

      <PromptBuilderMessageList />
      <PromptBuilderComposer />
    </section>
  );
}
