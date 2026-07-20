import { useState } from "react";
import { useI18n } from "../../i18n";
import { formatDuration } from "../../lib/agentToolFormatting";
import { AgentResultThumb } from "./AgentResultThumb";
import type { AgentImageHandle, AgentToolCallSummary } from "./agentTypes";

type Props = {
  call: AgentToolCallSummary;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentToolCallDetails({ call, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const imageIds = call.imageIds ?? [];
  const duration = formatDuration(call.durationMs);
  const [expandedFields, setExpandedFields] = useState<Record<"input" | "output", boolean>>({ input: false, output: false });
  const field = (key: "input" | "output", value: string) => (
    <dd className={expandedFields[key] ? "is-expanded" : undefined}>
      <span>{value}</span>
      <button type="button" onClick={() => setExpandedFields((current) => ({ ...current, [key]: !current[key] }))}>
        {t(expandedFields[key] ? "agent.toolsShowLess" : "agent.toolsShowMore")}
      </button>
    </dd>
  );

  return (
    <div className="agent-tool-call-details">
      <dl>
        <div>
          <dt>{t("agent.toolInput")}</dt>
          {field("input", call.inputSummary ?? "-")}
        </div>
        <div>
          <dt>{t("agent.toolOutput")}</dt>
          {field("output", call.errorMessage ?? call.outputSummary ?? "-")}
        </div>
        {call.requestId ? (
          <div>
            <dt>{t("agent.requestId")}</dt>
            <dd>{call.requestId}</dd>
          </div>
        ) : null}
        {duration ? (
          <div>
            <dt>{t("agent.duration")}</dt>
            <dd>{duration}</dd>
          </div>
        ) : null}
      </dl>
      {imageIds.length > 0 ? (
        <div className="agent-tool-call-details__artifacts" aria-label={t("agent.toolArtifacts")}>
          {imageIds.map((imageId) => {
            const image = imagesById[imageId];
            if (!image) return null;
            return (
              <AgentResultThumb
                key={imageId}
                image={image}
                selected={imageId === currentImageId}
                compact
                onSelect={onImageSelect}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
