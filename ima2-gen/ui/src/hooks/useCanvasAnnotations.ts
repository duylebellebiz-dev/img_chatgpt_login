import { useCallback, useMemo, useReducer } from "react";
import type {
  CanvasAnnotationStyle,
  CanvasEraserMode,
  NormalizedPoint,
  SavedCanvasAnnotations,
} from "../types/canvas";
import {
  reducer,
  initialState,
  persistCanvasStyle,
  type AnnotationTool,
} from "./canvasAnnotationHelpers";
import type { CanvasObjectKey } from "../lib/canvas/objectKeys";
export { CANVAS_STROKE_WIDTHS, CANVAS_STYLE_COLORS } from "./canvasAnnotationHelpers";

export function useCanvasAnnotations() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hasAnnotations = useMemo(
    () => state.paths.length > 0 || state.boxes.length > 0 || state.memos.length > 0,
    [state.paths.length, state.boxes.length, state.memos.length],
  );
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const setTool = useCallback((tool: AnnotationTool) => dispatch({ type: "SET_TOOL", tool }), []);
  const setStyle = useCallback((style: CanvasAnnotationStyle) => {
    persistCanvasStyle(style);
    dispatch({ type: "SET_STYLE", style });
  }, []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const load = useCallback((payload: SavedCanvasAnnotations) => dispatch({ type: "LOAD", payload }), []);
  const markSaved = useCallback(() => dispatch({ type: "MARK_SAVED" }), []);
  const resetLocal = useCallback(() => dispatch({ type: "RESET_LOCAL" }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const commitMemoEdit = useCallback(() => dispatch({ type: "COMMIT_MEMO_EDIT" }), []);
  const startSelectedMove = useCallback(() => dispatch({ type: "START_SELECTED_MOVE" }), []);
  const commitSelectedMove = useCallback(() => dispatch({ type: "COMMIT_SELECTED_MOVE" }), []);

  const startDrawing = useCallback((point: NormalizedPoint) => {
    if (state.activeTool === "pen" || state.activeTool === "arrow") dispatch({ type: "START_PATH", point });
    else if (state.activeTool === "box") dispatch({ type: "START_BOX", point });
  }, [state.activeTool]);
  const moveDrawing = useCallback((point: NormalizedPoint) => {
    if (state.activePath) dispatch({ type: "ADD_POINT", point });
    else if (state.activeBox) dispatch({ type: "UPDATE_BOX", point });
  }, [state.activePath, state.activeBox]);
  const endDrawing = useCallback(() => {
    if (state.activePath) dispatch({ type: "END_PATH" });
    else if (state.activeBox) dispatch({ type: "END_BOX" });
  }, [state.activePath, state.activeBox]);
  const createMemo = useCallback((point: NormalizedPoint) => dispatch({ type: "CREATE_MEMO", point }), []);
  const updateMemo = useCallback((id: string, text: string) => dispatch({ type: "UPDATE_MEMO", id, text }), []);
  const deleteMemo = useCallback((id: string) => dispatch({ type: "DELETE_MEMO", id }), []);
  const focusMemo = useCallback((id: string | null) => dispatch({ type: "FOCUS_MEMO", id }), []);
  const setEraserMode = useCallback((mode: CanvasEraserMode) => dispatch({ type: "SET_ERASER_MODE", mode }), []);
  const selectOne = useCallback((id: CanvasObjectKey) => dispatch({ type: "SELECT_ONE", id }), []);
  const toggleSelected = useCallback((id: CanvasObjectKey) => dispatch({ type: "TOGGLE_SELECTED", id }), []);
  const clearSelection = useCallback(() => dispatch({ type: "CLEAR_SELECTION" }), []);
  const deleteSelected = useCallback(() => dispatch({ type: "DELETE_SELECTED" }), []);
  const moveSelected = useCallback((delta: NormalizedPoint) => dispatch({ type: "MOVE_SELECTED", delta }), []);
  const startSelectionBox = useCallback((point: NormalizedPoint) => dispatch({ type: "START_SELECTION_BOX", point }), []);
  const updateSelectionBox = useCallback((point: NormalizedPoint) => dispatch({ type: "UPDATE_SELECTION_BOX", point }), []);
  const endSelectionBox = useCallback((ids: CanvasObjectKey[]) => dispatch({ type: "END_SELECTION_BOX", ids }), []);
  const eraseObjectAtPoint = useCallback((id: CanvasObjectKey) => dispatch({ type: "ERASE_OBJECT", id }), []);
  const startEraserStroke = useCallback((point: NormalizedPoint) => dispatch({ type: "START_ERASER_STROKE", point }), []);
  const updateEraserStroke = useCallback((point: NormalizedPoint) => dispatch({ type: "UPDATE_ERASER_STROKE", point }), []);
  const endEraserStroke = useCallback(() => dispatch({ type: "END_ERASER_STROKE" }), []);
  const toPayload = useCallback((): SavedCanvasAnnotations => ({
    paths: state.paths,
    boxes: state.boxes,
    memos: state.memos,
  }), [state.paths, state.boxes, state.memos]);

  return {
    ...state,
    canUndo,
    canRedo,
    hasAnnotations,
    setTool,
    setStyle,
    setEraserMode,
    startDrawing,
    moveDrawing,
    endDrawing,
    createMemo,
    updateMemo,
    commitMemoEdit,
    deleteMemo,
    focusMemo,
    clear,
    load,
    toPayload,
    markSaved,
    resetLocal,
    undo,
    redo,
    selectOne,
    toggleSelected,
    clearSelection,
    deleteSelected,
    moveSelected,
    startSelectedMove,
    commitSelectedMove,
    startSelectionBox,
    updateSelectionBox,
    endSelectionBox,
    eraseObjectAtPoint,
    startEraserStroke,
    updateEraserStroke,
    endEraserStroke,
  };
}
