import type { AgentLayoutMode } from "../components/agent/agentTypes";

export function resolveAgentLayout(input: {
  width: number;
  height: number;
}): AgentLayoutMode {
  const { width, height } = input;
  if (width >= 1280) return "desktop-three-pane";
  if (height < 560 && width < 1280) {
    return width >= 768 ? "tablet-stacked" : "mobile-chat-image-sheet";
  }
  if (width >= 960 && height >= 560) return "desktop-rail";
  if (width >= 768 && height >= 700) return "tablet-stacked";
  return "mobile-chat-image-sheet";
}
