import { useI18n } from "../../i18n";
import { AgentResultThumb } from "./AgentResultThumb";
import { AgentToolGroup } from "./AgentToolGroup";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

function isVisibleAssistantTurn(turn: AgentTurn): boolean {
  return turn.role !== "tool" && (turn.text.trim().length > 0 || (turn.imageIds?.length ?? 0) > 0);
}

export function AgentRunGroup({ turns, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const toolTurns = turns.filter((turn) => turn.role === "tool");
  const assistantTurns = turns.filter(isVisibleAssistantTurn);
  const isStreaming = turns.some((turn) => turn.status === "streaming");
  const hasError = turns.some((turn) => turn.status === "error");
  const stateClass = isStreaming ? " is-streaming" : hasError ? " is-error" : "";
  const roleLabel = hasError ? t("agent.errorRole") : t("agent.assistant");

  return (
    <article className={`agent-message agent-message--assistant-run${stateClass}`} aria-busy={isStreaming ? "true" : undefined}>
      <div className="agent-run__header">
        <div className="agent-message__role">{roleLabel}</div>
        {toolTurns.length > 0 ? (
          <div className="agent-run__header-tool">
            <AgentToolGroup turns={toolTurns} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
          </div>
        ) : null}
      </div>
      {assistantTurns.length > 0 ? (
        <ol className="agent-run__steps" aria-label={roleLabel}>
          {assistantTurns.map((turn) => {
            const imageIds = turn.imageIds ?? [];
            const itemClass = turn.status === "streaming" ? " is-streaming" : turn.status === "error" ? " is-error" : "";
            return (
              <li key={turn.id} className={`agent-run__step${itemClass}`}>
                <span className="agent-run__step-marker" aria-hidden="true" />
                <div className="agent-run__step-body">
                  {turn.text.trim().length > 0 ? <p>{turn.text}</p> : null}
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
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </article>
  );
}
