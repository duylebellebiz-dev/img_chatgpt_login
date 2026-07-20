/** Normalize SSE `error` payloads from flat (abortJob) and nested (writeNodeError) shapes. */
export function parseSseErrorPayload(
  data: Record<string, unknown>,
  fallbackMessage = "Generation failed",
): Error & { code?: string; status?: number } {
  const nested = data.error;
  let message = fallbackMessage;
  let code: string | undefined;

  if (typeof nested === "string") {
    message = nested;
  } else if (nested && typeof nested === "object") {
    const obj = nested as { message?: string; code?: string };
    if (typeof obj.message === "string" && obj.message) message = obj.message;
    if (typeof obj.code === "string") code = obj.code;
  }

  if (typeof data.code === "string") code = code ?? data.code;
  const status = typeof data.status === "number" ? data.status : undefined;

  const e = new Error(message) as Error & { code?: string; status?: number };
  e.code = code;
  e.status = status;
  return e;
}