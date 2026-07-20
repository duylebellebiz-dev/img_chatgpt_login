export type SlashCommandName = "question" | "help" | "variants" | "generate" | "parallelism";

export type SlashCommandDef = {
  name: SlashCommandName;
  display: string;
  aliases: string[];
  descriptionKey: string;
  hasValue?: boolean;
};

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: "question",
    display: "/question",
    aliases: ["question", "ask", "q"],
    descriptionKey: "agent.slashDesc_question",
  },
  {
    name: "variants",
    display: "/variants <N>",
    aliases: ["variants", "variant", "v", "n"],
    descriptionKey: "agent.slashDesc_variants",
    hasValue: true,
  },
  {
    name: "generate",
    display: "/generate <N>",
    aliases: ["generate", "gen", "g"],
    descriptionKey: "agent.slashDesc_generate",
    hasValue: true,
  },
  {
    name: "parallelism",
    display: "/parallelism <N>",
    aliases: ["parallelism", "parallel", "p"],
    descriptionKey: "agent.slashDesc_parallelism",
    hasValue: true,
  },
  {
    name: "help",
    display: "/help",
    aliases: ["help", "h"],
    descriptionKey: "agent.slashDesc_help",
  },
];

export function filterCommands(query: string): SlashCommandDef[] {
  const q = query.toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.aliases.some((alias) => alias.startsWith(q))
  );
}
