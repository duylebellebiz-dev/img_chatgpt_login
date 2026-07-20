import { AgentPromptLibraryPanel } from "./AgentPromptLibraryPanel";

type Props = {
  onInsert: (text: string) => void;
};

export function AgentFormTemplatePanel({ onInsert }: Props) {
  return <AgentPromptLibraryPanel mode="forms" onInsert={onInsert} />;
}
