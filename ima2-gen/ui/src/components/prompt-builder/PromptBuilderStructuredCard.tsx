import { useAppStore } from "../../store/useAppStore";
import { useI18n } from "../../i18n";
import type { PromptBuilderFinalPromptBlock } from "../../lib/promptBuilder/structuredOutput";

type Props = {
  messageId: string;
  prompt: PromptBuilderFinalPromptBlock;
};

export function PromptBuilderStructuredCard({ messageId, prompt }: Props) {
  const setPrompt = useAppStore((s) => s.setPrompt);
  const insertPromptToComposer = useAppStore((s) => s.insertPromptToComposer);
  const showToast = useAppStore((s) => s.showToast);
  const { t } = useI18n();

  const title =
    prompt.language === "ko"
      ? t("promptBuilder.finalKoreanPrompt")
      : t("promptBuilder.finalEnglishPrompt");

  const applyToPrompt = () => {
    setPrompt(prompt.text);
    showToast(t("promptBuilder.applied"));
  };

  const insertAsBlock = () => {
    insertPromptToComposer({
      id: `builder_${messageId}_${prompt.language}`,
      name: title,
      text: prompt.text,
      placement: "after",
    });
    showToast(t("promptBuilder.inserted"));
  };

  return (
    <section
      className="prompt-builder__structured-card"
      aria-label={title}
    >
      <div className="prompt-builder__structured-card-header">
        <strong>{title}</strong>
        <span>{prompt.language.toUpperCase()}</span>
      </div>
      <p>{prompt.text}</p>
      <div className="prompt-builder__structured-actions">
        <button type="button" onClick={applyToPrompt}>
          {t("promptBuilder.applyToPrompt")}
        </button>
        <button type="button" onClick={insertAsBlock}>
          {t("promptBuilder.insertAsBlock")}
        </button>
      </div>
    </section>
  );
}
