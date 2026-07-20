import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent, type SyntheticEvent } from "react";
import { useI18n } from "../../i18n";
import { AgentContextTabs } from "./AgentContextTabs";
import { ImageIcon } from "./AgentIcons";
import { AgentResultThumb } from "./AgentResultThumb";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentContextTab, AgentImageHandle } from "./agentTypes";
import { isVideoUrl } from "../../lib/videoMedia";

type Props = {
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  activeTab: AgentContextTab;
  onTabChange: (tab: AgentContextTab) => void;
  onImageSelect: (imageId: string) => void;
  headerAction?: ReactNode;
};

function TabBody({ activeTab, currentImage }: Pick<Props, "activeTab" | "currentImage">) {
  const { t } = useI18n();
  if (activeTab === "refs") return <div className="agent-tab-empty">{t("agent.noRefs")}</div>;
  if (activeTab === "web") return <div className="agent-tab-empty">{t("agent.noWeb")}</div>;
  if (activeTab === "memory") {
    return (
      <ul className="agent-memory-list">
        <li>{t("agent.memoryItemStyle")}</li>
        <li>{t("agent.memoryItemSubject")}</li>
      </ul>
    );
  }
  return (
    <dl className="agent-image-meta">
      <div><dt>{t("agent.filename")}</dt><dd>{currentImage?.filename ?? "-"}</dd></div>
      <div><dt>{t("agent.prompt")}</dt><dd>{currentImage?.prompt ?? currentImage?.revisedPrompt ?? "-"}</dd></div>
    </dl>
  );
}

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function AgentVideoPreview({ image }: { image: AgentImageHandle }) {
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [duration, setDuration] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const handleMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const nextDuration = event.currentTarget.duration;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : null);
    setState("ready");
  };
  const retry = () => {
    setState("loading");
    setDuration(null);
    setRetryKey((value) => value + 1);
  };

  return (
    <div className="agent-video-preview">
      {state === "loading" ? <div className="agent-video-preview__skeleton" role="status">{t("agent.mediaLoading")}</div> : null}
      {state === "error" ? (
        <div className="agent-video-preview__error" role="alert">
          <ImageIcon size={34} />
          <span>{t("agent.mediaLoadFailed")}</span>
          <button type="button" onClick={retry}>{t("agent.mediaRetry")}</button>
        </div>
      ) : (
        <video
          key={retryKey}
          src={image.url}
          controls
          playsInline
          preload="metadata"
          aria-label={image.prompt ?? t("agent.mediaVideoLabel")}
          onLoadedMetadata={handleMetadata}
          onError={() => setState("error")}
        />
      )}
      <div className="agent-video-preview__toolbar">
        <span>{duration == null ? t("agent.mediaDurationUnknown") : t("agent.mediaDuration", { duration: formatDuration(duration) })}</span>
        <a href={image.url} download={image.filename}>{t("agent.mediaDownload")}</a>
      </div>
    </div>
  );
}

export function AgentImagePane({ currentImage, images, activeTab, onTabChange, onImageSelect, headerAction }: Props) {
  const { t } = useI18n();
  const variantRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const currentIndex = useMemo(
    () => images.findIndex((image) => image.id === currentImage?.id),
    [currentImage?.id, images],
  );

  useEffect(() => {
    if (!currentImage?.id) return;
    variantRefs.current[currentImage.id]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentImage?.id]);

  const selectByIndex = useCallback((index: number) => {
    const image = images[index];
    if (image) onImageSelect(image.id);
  }, [images, onImageSelect]);

  const handleImageKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (images.length === 0) return;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, baseIndex - 1);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(images.length - 1, baseIndex + 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = images.length - 1;
    if (nextIndex === null || nextIndex === baseIndex) return;
    event.preventDefault();
    selectByIndex(nextIndex);
  }, [currentIndex, images.length, selectByIndex]);

  return (
    <section className="agent-image" aria-label={t("agent.imagePane")}>
      <header className="agent-pane-header">
        <div className="agent-pane-header__title">
          <span>{t("agent.imagePane")}</span>
          <strong>{t("agent.currentImage")}</strong>
        </div>
        {headerAction}
      </header>
      <div
        className="agent-image__preview"
        tabIndex={images.length > 1 ? 0 : undefined}
        onKeyDown={handleImageKeyDown}
        aria-label={images.length > 1 ? t("agent.variants") : undefined}
      >
        {currentImage ? (
          isVideoUrl(currentImage.url) ? <AgentVideoPreview key={currentImage.id} image={currentImage} /> : (
            <AgentSafeImage
              src={currentImage.url}
              alt={currentImage.prompt ?? t("agent.imageAlt")}
              fallbackClassName="agent-image__empty"
              iconSize={34}
            />
          )
        ) : <div className="agent-image__empty"><ImageIcon size={34} /><span>{t("agent.noImage")}</span></div>}
      </div>
      <div className="agent-image__variants" aria-label={t("agent.variants")} onKeyDown={handleImageKeyDown}>
        {images.map((image) => (
          <AgentResultThumb
            key={image.id}
            ref={(node) => {
              variantRefs.current[image.id] = node;
            }}
            image={image}
            selected={image.id === currentImage?.id}
            onSelect={onImageSelect}
          />
        ))}
      </div>
      <AgentContextTabs activeTab={activeTab} onChange={onTabChange} />
      <TabBody activeTab={activeTab} currentImage={currentImage} />
    </section>
  );
}
