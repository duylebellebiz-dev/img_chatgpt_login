import { errInfo } from "../errInfo.js";
import { logWarn } from "../logger.js";
import { fetchOAuth, waitForOAuthReady } from "../oauthProxy/runtime.js";
import type { RouteRuntimeContext } from "../runtimeContext.js";
import { promptBuilderError } from "./errors.js";
import { normalizeModel, normalizeMessages } from "./requestSchema.js";
import { buildTransportPayload } from "./transport.js";
import {
  parseUpstreamError,
  responseSummary,
  extractChatText,
  readResponsesResult,
} from "./responseParser.js";
import type {
  PromptBuilderRequest,
  PromptBuilderChatResult,
  ChatCompletionBody,
  ResponsesReadResult,
} from "./types.js";

export async function requestPromptBuilderChat(
  ctx: RouteRuntimeContext,
  input: PromptBuilderRequest,
): Promise<PromptBuilderChatResult> {
  const model = normalizeModel(input.model);
  const messages = normalizeMessages(input.messages);

  await waitForOAuthReady(ctx);

  const timeoutMs = ctx.config?.oauth?.generationTimeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { endpoint, body: payload } = buildTransportPayload(
      model,
      messages,
      input.context,
    );
    const url = `${ctx.oauthUrl}${endpoint === "responses" ? "/v1/responses" : "/v1/chat/completions"}`;

    const res = await fetchOAuth(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload),
      },
      { scope: "prompt-builder" },
    );

    if (!res.ok) {
      const text = await res.text();
      const upstream = parseUpstreamError(text);
      logWarn("prompt-builder", "upstream_failed", {
        endpoint,
        model,
        status: res.status,
        hasImageAttachments: endpoint === "responses",
        upstreamBodyChars: text.length,
        upstreamCode: upstream.upstreamCode,
        upstreamType: upstream.upstreamType,
        upstreamParam: upstream.upstreamParam,
      });
      const err = promptBuilderError(
        "Prompt builder upstream failed",
        "PROMPT_BUILDER_UPSTREAM_FAILED",
        502,
      );
      err.upstreamStatus = res.status;
      err.upstreamBodyChars = text.length;
      err.upstreamEndpoint = endpoint;
      err.upstreamCode = upstream.upstreamCode;
      err.upstreamType = upstream.upstreamType;
      err.upstreamParam = upstream.upstreamParam;
      throw err;
    }

    const useResponses = endpoint === "responses";
    const responseBody = useResponses
      ? await readResponsesResult(res)
      : ((await res.json()) as ChatCompletionBody);
    const content = (
      useResponses
        ? (responseBody as ResponsesReadResult).content
        : extractChatText(responseBody as ChatCompletionBody)
    ).trim();

    if (!content) {
      const summary = useResponses
        ? (responseBody as ResponsesReadResult).summary
        : responseSummary(responseBody);
      logWarn("prompt-builder", "empty_response", {
        endpoint,
        model,
        ...summary,
      });
      const err = promptBuilderError(
        "Prompt builder returned an empty response",
        "PROMPT_BUILDER_EMPTY_RESPONSE",
        502,
      );
      err.upstreamEndpoint = endpoint;
      Object.assign(err, summary);
      throw err;
    }

    return {
      provider: "oauth",
      model,
      message: { role: "assistant", content },
      usage: useResponses
        ? (responseBody as ResponsesReadResult).usage
        : ((responseBody as ChatCompletionBody).usage ?? null),
    };
  } catch (error) {
    const info = errInfo(error);
    if (info.name === "AbortError") {
      throw promptBuilderError(
        "Prompt builder timed out",
        "PROMPT_BUILDER_TIMEOUT",
        504,
      );
    }
    throw info.raw;
  } finally {
    clearTimeout(timer);
  }
}
