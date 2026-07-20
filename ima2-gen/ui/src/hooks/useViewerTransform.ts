import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";

export const VIEWER_MIN_ZOOM = 1;
export const VIEWER_MAX_ZOOM = 5;
export const VIEWER_ZOOM_STEP = 0.22;

type ViewerPan = {
  x: number;
  y: number;
};

type ViewerDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
};

function clampViewerZoom(value: number): number {
  return Math.min(VIEWER_MAX_ZOOM, Math.max(VIEWER_MIN_ZOOM, value));
}

export function useViewerTransform(resetKey: string | null) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<ViewerPan>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<ViewerDrag | null>(null);
  const rafRef = useRef(0);
  const pendingPanRef = useRef<ViewerPan | null>(null);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    pendingPanRef.current = null;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDrag(null);
  }, []);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => {
      const next = clampViewerZoom(current + delta);
      if (next <= VIEWER_MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
        return VIEWER_MIN_ZOOM;
      }
      return Number(next.toFixed(2));
    });
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP);
    },
    [changeZoom],
  );

  const handleDoubleClick = useCallback(() => {
    if (zoom > VIEWER_MIN_ZOOM) {
      reset();
      return;
    }
    setZoom(2);
  }, [reset, zoom]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (zoom <= VIEWER_MIN_ZOOM || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: pan.x,
        baseY: pan.y,
      });
    },
    [pan.x, pan.y, zoom],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = {
        x: drag.baseX + event.clientX - drag.startX,
        y: drag.baseY + event.clientY - drag.startY,
      };
      pendingPanRef.current = next;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPan(next);
        pendingPanRef.current = null;
      });
    },
    [drag],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (pendingPanRef.current) {
        setPan(pendingPanRef.current);
        pendingPanRef.current = null;
      }
      setDrag(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [drag],
  );

  return {
    zoom,
    pan,
    reset,
    zoomIn: () => changeZoom(VIEWER_ZOOM_STEP),
    zoomOut: () => changeZoom(-VIEWER_ZOOM_STEP),
    handleWheel,
    handleDoubleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
