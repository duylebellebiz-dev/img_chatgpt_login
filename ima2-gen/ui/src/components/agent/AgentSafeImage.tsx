import { useState } from "react";
import { ImageIcon } from "./AgentIcons";
import { isVideoUrl } from "../../lib/videoMedia";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  iconSize?: number;
};

export function AgentSafeImage({ src, alt, className, fallbackClassName, iconSize = 18 }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={fallbackClassName ?? "agent-image-fallback"} aria-label={alt} role="img">
        <ImageIcon size={iconSize} />
      </span>
    );
  }

  if (isVideoUrl(src)) {
    return <video className={className} src={src} preload="metadata" playsInline muted onError={() => setFailed(true)} aria-label={alt} />;
  }

  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}
