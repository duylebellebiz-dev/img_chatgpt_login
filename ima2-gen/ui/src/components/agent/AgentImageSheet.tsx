import { useCallback } from "react";
import { useI18n } from "../../i18n";
import { AgentImagePane } from "./AgentImagePane";
import { CloseIcon } from "./AgentIcons";
import { useAgentDialogFocus } from "./useAgentDialogFocus";
import type { AgentContextTab, AgentImageHandle } from "./agentTypes";

type Props = {
  open: boolean;
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  activeTab: AgentContextTab;
  onTabChange: (tab: AgentContextTab) => void;
  onImageSelect: (imageId: string) => void;
  onClose: () => void;
};

export function AgentImageSheet({ open, currentImage, images, activeTab, onTabChange, onImageSelect, onClose }: Props) {
  const { t } = useI18n();
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useAgentDialogFocus(open, close);
  if (!open) return null;

  return (
    <div className="agent-dialog agent-dialog--image" role="presentation">
      <button type="button" className="agent-dialog__backdrop" onClick={onClose} aria-label={t("agent.closeImage")} />
      <section ref={panelRef} className="agent-image-sheet" role="dialog" aria-modal="true" aria-label={t("agent.imagePane")}>
        <AgentImagePane
          currentImage={currentImage}
          images={images}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onImageSelect={onImageSelect}
          headerAction={(
            <button type="button" onClick={onClose} aria-label={t("agent.closeImage")}>
              <CloseIcon size={17} />
            </button>
          )}
        />
      </section>
    </div>
  );
}
