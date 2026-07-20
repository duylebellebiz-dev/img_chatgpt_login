import { useI18n } from "../../i18n";
import { AgentResultThumb } from "./AgentResultThumb";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentMessage({ turn, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const roleLabel =
    turn.role === "user"
      ? t("agent.user")
      : turn.status === "error"
        ? t("agent.errorRole")
        : t("agent.assistant");
  const imageIds = turn.imageIds ?? [];
  const stateClass = turn.status === "streaming" ? " is-streaming" : turn.status === "error" ? " is-error" : "";
  const className = `agent-message agent-message--${turn.role}${stateClass}`;

  return (
    <article
      className={className}
      aria-busy={turn.status === "streaming" ? "true" : undefined}
    >
      <div className="agent-message__role">{roleLabel}</div>
      <p>{turn.text}</p>
      {imageIds.length > 0 ? (
        <div className="agent-message__images">
          {imageIds.map((imageId) => {
            const image = imagesById[imageId];
            if (!image) return null;
            return (
              <AgentResultThumb
                key={imageId}
                image={image}
                selected={imageId === currentImageId}
                compact={false}
                onSelect={onImageSelect}
              />
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
