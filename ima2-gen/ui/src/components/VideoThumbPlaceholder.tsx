type VideoThumbPlaceholderProps = {
  className?: string;
};

/**
 * Static stand-in for a video whose server thumbnail is not ready yet.
 *
 * Renders NO <video> element on purpose. A live `<video preload="metadata">`
 * per gallery tile exhausts the browser's concurrent media-element/decoder
 * budget and opens an MP4 range-fetch over the shared origin connection pool —
 * the root cause of the reload-recoverable gallery hang (devlog 260603 RCA 01,
 * Defect E). Once the server backfills `item.thumb`, callers switch back to an
 * `<img>` automatically. The ▶ badge (where present) stays as a sibling.
 */
export function VideoThumbPlaceholder({ className }: VideoThumbPlaceholderProps) {
  return (
    <span
      className={["video-thumb-placeholder", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
