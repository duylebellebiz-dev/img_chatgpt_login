import type { PromptBuilderError } from "./types.js";

export function promptBuilderError(
  message: string,
  code: string,
  status = 400,
): PromptBuilderError {
  const err = new Error(message) as PromptBuilderError;
  err.code = code;
  err.status = status;
  return err;
}
