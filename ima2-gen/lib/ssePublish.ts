import { publish } from "./eventBus.js";
import { isJobCanceled } from "./inflight.js";

/**
 * Publish a multiplexed job event. Suppresses terminal `done` after cancel so
 * clients never resolve success when abortJob already emitted `error`.
 */
export function publishJobEvent(
  requestId: string,
  event: string,
  data: Record<string, unknown>,
): boolean {
  if (event === "done" && isJobCanceled(requestId)) return false;
  publish(requestId, event, data);
  return true;
}
