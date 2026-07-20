import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { formatDuration } from "../../lib/agentToolFormatting";
import { ChevronDownIcon, ChevronRightIcon } from "./AgentIcons";
import { AgentToolCallDetails } from "./AgentToolCallDetails";
import type { AgentImageHandle, AgentToolCallSummary } from "./agentTypes";

type Props = {
  call: AgentToolCallSummary;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentToolCallRow({ call, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const duration = formatDuration(call.durationMs);

  return (
    <li className={`agent-tool-call-row agent-tool-call-row--${call.status}`}>
      <button
        type="button"
        className="agent-tool-call-row__toggle"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-busy={call.status === "running" ? "true" : undefined}
        onClick={() => setExpanded((next) => !next)}
      >
        <span className="agent-tool-call-row__status" aria-label={t(`agent.toolStatus.${call.status}`)} />
        <span className="agent-tool-call-row__name">{call.name}</span>
        {call.imageIds?.length ? <span className="agent-tool-call-row__meta">{t("agent.toolImageCount", { count: call.imageIds.length })}</span> : null}
        {duration ? <span className="agent-tool-call-row__meta">{duration}</span> : null}
        {expanded ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
      </button>
      <div id={detailsId} hidden={!expanded}>
        <AgentToolCallDetails call={call} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
      </div>
    </li>
  );
}
