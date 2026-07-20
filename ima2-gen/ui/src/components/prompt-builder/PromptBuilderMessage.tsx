import { useI18n } from "../../i18n";
import { extractPromptBuilderFinalPrompts } from "../../lib/promptBuilder/structuredOutput";
import { PromptBuilderStructuredCard } from "./PromptBuilderStructuredCard";
import type { PromptBuilderMessage as PBMessage } from "../../store/promptBuilderStore";
import type { PromptBuilderAttachment } from "../../store/promptBuilderStore";

function attachmentIcon(attachment: PromptBuilderAttachment): string {
  if (attachment.kind === "image") return "IMG";
  if (attachment.kind === "text") return "TXT";
  return "FILE";
}

type Props = {
  message: PBMessage;
};

export function PromptBuilderMessage({ message }: Props) {
  const { t } = useI18n();
  const structured =
    message.role === "assistant"
      ? extractPromptBuilderFinalPrompts(message.content)
      : null;

  return (
    <article className={`prompt-builder__message prompt-builder__message--${message.role}`}>
      <div className="prompt-builder__message-role">
        {message.role === "user" ? t("promptBuilder.user") : t("promptBuilder.assistant")}
      </div>
      {structured ? (
        <div className="prompt-builder__structured-prompts">
          {structured.summary ? (
            <p className="prompt-builder__structured-summary">{structured.summary}</p>
          ) : null}
          {structured.prompts.map((prompt) => (
            <PromptBuilderStructuredCard
              key={`${message.id}-${prompt.language}`}
              messageId={message.id}
              prompt={prompt}
            />
          ))}
          {structured.notes ? (
            <p className="prompt-builder__structured-notes">{structured.notes}</p>
          ) : null}
        </div>
      ) : (
        <p>{message.content}</p>
      )}
      {message.attachments && message.attachments.length > 0 ? (
        <div className="prompt-builder__message-attachments">
          {message.attachments.map((attachment) => (
            <span key={attachment.id} className="prompt-builder__message-attachment">
              {attachment.kind === "image" && attachment.dataUrl ? (
                <img src={attachment.dataUrl} alt="" />
              ) : (
                <span>{attachmentIcon(attachment)}</span>
              )}
              <em>{attachment.name}</em>
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
