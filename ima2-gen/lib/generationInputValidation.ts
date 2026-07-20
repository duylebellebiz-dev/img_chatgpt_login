import { normalizeRequestId } from "./requestLogger.js";

export const MAX_GENERATION_PROMPT_CHARS = 32_000;

export type GenerationInputError = {
  error: { code: string; message: string };
};

export function normalizeBodyRequestId(bodyRequestId: unknown, fallbackRequestId: unknown): string {
  return normalizeRequestId(bodyRequestId === undefined ? fallbackRequestId : bodyRequestId);
}

export function validateGenerationPrompt(prompt: unknown): GenerationInputError | null {
  if (typeof prompt !== "string" || prompt.length === 0) {
    return { error: { code: "INVALID_PROMPT", message: "Prompt must be a non-empty string" } };
  }
  if (prompt.length > MAX_GENERATION_PROMPT_CHARS) {
    return {
      error: {
        code: "PROMPT_TOO_LONG",
        message: `Prompt must not exceed ${MAX_GENERATION_PROMPT_CHARS} characters`,
      },
    };
  }
  return null;
}

export function validateBoundedCount(
  value: unknown,
  fallback: number,
  maximum: number,
  field: string,
): { value: number } | GenerationInputError {
  const candidate = value === undefined ? fallback : value;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    return {
      error: {
        code: "INVALID_COUNT",
        message: `${field} must be an integer between 1 and ${maximum}`,
      },
    };
  }
  return { value: parsed };
}
