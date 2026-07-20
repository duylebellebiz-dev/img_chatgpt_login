import { isJobCanceled } from "./inflight.js";

export const GENERATION_CANCELED_CODE = "GENERATION_CANCELED";

export interface GenerationCanceledError extends Error {
  status: number;
  code: typeof GENERATION_CANCELED_CODE;
}

export function makeGenerationCanceledError(): GenerationCanceledError {
  const err = new Error("Generation canceled") as GenerationCanceledError;
  err.status = 499;
  err.code = GENERATION_CANCELED_CODE;
  return err;
}

export function isGenerationCanceledError(value: unknown): value is GenerationCanceledError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      (value as { code?: unknown }).code === GENERATION_CANCELED_CODE,
  );
}

export function throwIfJobCanceled(requestId: string | null | undefined) {
  if (isJobCanceled(requestId)) throw makeGenerationCanceledError();
}
