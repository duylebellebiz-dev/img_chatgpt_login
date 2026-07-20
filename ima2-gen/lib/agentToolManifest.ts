import { AGENT_ALLOWED_TOOLS, type AgentToolName } from "./agentTypes.js";

export interface AgentToolManifestEntry {
  name: AgentToolName;
  description: string;
  parameters: Record<string, unknown>;
}

// Single source of truth for the agent tool surface. Consumed by the LLM
// planner developer prompt, /api/agent/tools, and capabilities.agentMode.
export const AGENT_TOOL_MANIFEST: readonly AgentToolManifestEntry[] = [
  {
    name: "ima2.get_image_context",
    description: "Load the session image context manifest (previous images, current image, locks). Runs automatically before image generation.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "ima2.web_search",
    description: "Search the web for factual visual references before generating. Only available when web search is enabled for the session.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for factual visual accuracy." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "ima2.generate_image",
    description: "Generate one or more images. Supports fanout: provide one prompt per variant.",
    parameters: {
      type: "object",
      properties: {
        prompts: {
          type: "array",
          items: { type: "string" },
          description: "One generation prompt per planned variant (1 to the configured image limit).",
        },
        plannedVariants: { type: "integer", minimum: 1, description: "Number of images to generate." },
        plannedParallelism: { type: "integer", minimum: 1, description: "Concurrent generation calls." },
        sourceImagePolicy: {
          type: "string",
          enum: ["auto", "none", "current"],
          description: "none creates a fresh image and ignores the current session image; current uses the current session image as edit/reference input; auto lets the runtime choose.",
        },
      },
      required: ["prompts"],
      additionalProperties: false,
    },
  },
  {
    name: "ima2.generate_video",
    description: "Generate a single video with Grok Imagine. If the session has a last image, it is used as the image-to-video source automatically; prompt-only Grok Video 1.5 uses the server white-canvas shim.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Video prompt describing visual flow and motion." },
        duration: { type: "integer", minimum: 1, maximum: 15, description: "Video duration in seconds. Default 5." },
        resolution: { type: "string", enum: ["480p", "720p", "1080p"], description: "Output resolution. Default 480p. 1080p uses Grok Video 1.5; prompt-only requests use the white-canvas I2V shim." },
        aspectRatio: {
          type: "string",
          enum: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
          description: "Output aspect ratio. Default auto.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "ima2.get_generation_errors",
    description: "Read-only lookup of the session's recent generation failures (failed queue jobs and error turns). Use when the user asks why a generation failed.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum error records to return. Default 10." },
      },
      additionalProperties: false,
    },
  },
];

const MANIFEST_NAMES = new Set<string>(AGENT_TOOL_MANIFEST.map((entry) => entry.name));
for (const tool of AGENT_ALLOWED_TOOLS) {
  if (!MANIFEST_NAMES.has(tool)) {
    throw new Error(`Agent tool manifest is missing an entry for: ${tool}`);
  }
}

export function formatToolManifestForPrompt(): string {
  return AGENT_TOOL_MANIFEST
    .map((entry) => `- ${entry.name}: ${entry.description}\n  parameters: ${JSON.stringify(entry.parameters)}`)
    .join("\n");
}
