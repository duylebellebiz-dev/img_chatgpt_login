import type { PromptBuilderContext } from "./types.js";

export function contextText(context: PromptBuilderContext | undefined): string {
  const lines: string[] = [];
  const currentPrompt =
    typeof context?.currentPrompt === "string" ? context.currentPrompt.trim() : "";
  if (currentPrompt) lines.push(`Current main prompt:\n${currentPrompt}`);

  const blocks = Array.isArray(context?.insertedPrompts) ? context.insertedPrompts : [];
  if (blocks.length > 0) {
    lines.push(
      `Inserted prompt blocks:\n${blocks
        .map((block, index) => {
          const name =
            typeof block.name === "string" && block.name.trim()
              ? block.name.trim()
              : `Block ${index + 1}`;
          const text = typeof block.text === "string" ? block.text.trim() : "";
          return `- ${name}: ${text}`;
        })
        .join("\n")}`,
    );
  }

  if (context?.settings && typeof context.settings === "object") {
    lines.push(`Generation settings:\n${JSON.stringify(context.settings)}`);
  }

  const resultPrompt =
    typeof context?.currentResultPrompt === "string"
      ? context.currentResultPrompt.trim()
      : "";
  if (resultPrompt) lines.push(`Current result prompt:\n${resultPrompt}`);

  return lines.join("\n\n");
}
