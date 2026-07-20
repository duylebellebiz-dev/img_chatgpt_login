export type PromptBuilderRole = "user" | "assistant";

export type PromptBuilderAttachment = {
  kind: "image" | "text" | "file";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
};

export type PromptBuilderMessage = {
  role: PromptBuilderRole;
  content: string;
  attachments?: PromptBuilderAttachment[];
};

export type PromptBuilderContext = {
  currentPrompt?: string;
  insertedPrompts?: Array<{ name?: string; text?: string }>;
  settings?: Record<string, unknown>;
  currentResultPrompt?: string | null;
};

export type PromptBuilderRequest = {
  model?: unknown;
  messages?: unknown;
  context?: PromptBuilderContext;
};

export type PromptBuilderError = Error & {
  status?: number;
  code?: string;
  upstreamStatus?: number;
  upstreamBodyChars?: number;
  upstreamEndpoint?: "chat" | "responses";
  upstreamCode?: string;
  upstreamType?: string;
  upstreamParam?: string;
  responseBodyKeys?: string;
  responseStatus?: string;
  responseErrorCode?: string;
  responseErrorType?: string;
  responseErrorParam?: string;
  responseIncompleteReason?: string;
  responseOutputTypes?: string;
  responseContentTypes?: string;
  responseOutputCount?: number;
  responseContentCount?: number;
};

export type ResponseShapeSummary = Pick<
  PromptBuilderError,
  | "responseBodyKeys"
  | "responseStatus"
  | "responseErrorCode"
  | "responseErrorType"
  | "responseErrorParam"
  | "responseIncompleteReason"
  | "responseOutputTypes"
  | "responseContentTypes"
  | "responseOutputCount"
  | "responseContentCount"
>;

export type ChatCompletionBody = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
    };
  }>;
  usage?: Record<string, unknown>;
};

export type ResponsesBody = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string | { value?: string };
      value?: string;
      refusal?: string;
    }>;
  }>;
  usage?: Record<string, unknown>;
};

export type ResponsesReadResult = {
  content: string;
  usage: Record<string, unknown> | null;
  summary: ResponseShapeSummary;
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type PromptBuilderChatResult = {
  provider: "oauth";
  model: string;
  message: { role: "assistant"; content: string };
  usage: Record<string, unknown> | null;
};
