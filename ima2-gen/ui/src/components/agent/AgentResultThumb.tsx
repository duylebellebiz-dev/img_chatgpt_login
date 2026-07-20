import { forwardRef } from "react";
import { useI18n } from "../../i18n";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentImageHandle } from "./agentTypes";

type Props = {
  image: AgentImageHandle;
  selected?: boolean;
  compact?: boolean;
  onSelect: (imageId: string) => void;
};

export const AgentResultThumb = forwardRef<HTMLButtonElement, Props>(function AgentResultThumb(
  { image, selected = false, compact = false, onSelect },
  ref,
) {
  const { t } = useI18n();
  const label = `${t("agent.mediaSelect")}: ${image.prompt ?? image.filename}`;
  const className = `${compact ? "agent-result-thumb agent-result-thumb--compact" : "agent-result-thumb"}${selected ? " is-selected" : ""}`;

  return (
    <button
      ref={ref}
      type="button"
      className={className}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(image.id)}
      title={t("agent.mediaSelect")}
    >
      <AgentSafeImage
        src={image.thumbUrl ?? image.url}
        alt={image.prompt ?? t("agent.imageAlt")}
        iconSize={compact ? 14 : 18}
      />
    </button>
  );
});
