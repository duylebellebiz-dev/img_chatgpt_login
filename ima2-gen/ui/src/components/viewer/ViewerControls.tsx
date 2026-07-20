type ViewerControlsProps = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  labels: {
    controls: string;
    zoomIn: string;
    zoomOut: string;
    reset: string;
  };
};

export function ViewerControls({
  zoom,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onReset,
  labels,
}: ViewerControlsProps) {
  return (
    <div
      className="viewer-controls"
      aria-label={labels.controls}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="viewer-control-btn"
        onClick={(event) => {
          event.stopPropagation();
          onZoomOut();
        }}
        disabled={zoom <= minZoom}
        aria-label={labels.zoomOut}
      >
        -
      </button>
      <button
        type="button"
        className="viewer-control-btn viewer-control-btn--label"
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
        aria-label={labels.reset}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="viewer-control-btn"
        onClick={(event) => {
          event.stopPropagation();
          onZoomIn();
        }}
        disabled={zoom >= maxZoom}
        aria-label={labels.zoomIn}
      >
        +
      </button>
    </div>
  );
}
