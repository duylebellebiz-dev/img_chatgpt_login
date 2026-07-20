import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { ArrowLeftIcon, ImageIcon, MenuIcon, QueueIcon } from "./AgentIcons";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentImageHandle, AgentLayoutMode, AgentSessionSummary } from "./agentTypes";

type Props = {
  layoutMode: AgentLayoutMode;
  session: AgentSessionSummary | null;
  currentImage: AgentImageHandle | null;
  activeJobCount: number;
  onOpenSessions: () => void;
  onOpenImage: () => void;
  onOpenQueue: () => void;
};

export function AgentTopBar({ layoutMode, session, currentImage, activeJobCount, onOpenSessions, onOpenImage, onOpenQueue }: Props) {
  const { t } = useI18n();
  const setUIMode = useAppStore((state) => state.setUIMode);
  const mobile = layoutMode === "mobile-chat-image-sheet";

  return (
    <header className="agent-topbar">
      <button type="button" className="agent-topbar__back" onClick={() => setUIMode("classic")} aria-label={t("agent.topbarBackToStudio")} title={t("agent.topbarBackToStudio")}>
        <ArrowLeftIcon size={18} />
        <span>{t("agent.topbarStudio")}</span>
      </button>
      <button type="button" className="agent-topbar__icon" onClick={onOpenSessions} aria-label={t("agent.openSessions")} title={t("agent.openSessions")}>
        <MenuIcon size={18} />
      </button>
      <div className="agent-topbar__title">
        <span>{t("agent.title")}</span>
        <strong>{session?.title ?? t("agent.newSession")}</strong>
      </div>
      {mobile ? (
        <div className="agent-topbar__actions">
          <button type="button" className="agent-topbar__queue" onClick={onOpenQueue} aria-label={t("agent.topbarOpenQueue", { count: activeJobCount })} title={t("agent.topbarOpenQueue", { count: activeJobCount })}>
            <QueueIcon size={17} />
            <span>{activeJobCount}</span>
          </button>
          <button type="button" className="agent-topbar__image" onClick={onOpenImage} aria-label={t("agent.openImage")} title={t("agent.openImage")}>
            {currentImage ? <AgentSafeImage src={currentImage.thumbUrl ?? currentImage.url} alt="" iconSize={18} /> : <ImageIcon size={18} />}
          </button>
        </div>
      ) : null}
    </header>
  );
}
