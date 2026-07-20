import { usePromptBuilderStore, type PromptBuilderAttachment } from "../../store/promptBuilderStore";
import { useI18n } from "../../i18n";

function attachmentIcon(attachment: PromptBuilderAttachment): string {
  if (attachment.kind === "image") return "IMG";
  if (attachment.kind === "text") return "TXT";
  return "FILE";
}

export function PromptBuilderAttachmentTray() {
  const attachments = usePromptBuilderStore((s) => s.attachments);
  const remove = usePromptBuilderStore((s) => s.removeAttachment);
  const { t } = useI18n();

  if (attachments.length === 0) return null;

  return (
    <div className="prompt-builder__attachments">
      {attachments.map((attachment) => (
        <span key={attachment.id} className="prompt-builder__attachment">
          {attachment.kind === "image" && attachment.dataUrl ? (
            <img src={attachment.dataUrl} alt="" />
          ) : (
            <span>{attachmentIcon(attachment)}</span>
          )}
          <em>{attachment.name}</em>
          <button
            type="button"
            onClick={() => remove(attachment.id)}
            aria-label={t("promptBuilder.removeAttachment", { name: attachment.name })}
            title={t("promptBuilder.removeAttachment", { name: attachment.name })}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
