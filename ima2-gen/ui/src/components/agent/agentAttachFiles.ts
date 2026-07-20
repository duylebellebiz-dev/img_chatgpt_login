import { imageHandleFromCurrent, updateAgentSession } from "../../lib/agentApi";
import type { GenerateItem } from "../../types";
import type { AgentWorkspacePayload } from "./agentTypes";

type AttachAgentImageFilesInput = {
  sessionId: string;
  files: File[];
  importLocalImageToHistory: (file: File) => Promise<GenerateItem | null>;
  applyWorkspace: (payload: AgentWorkspacePayload) => void;
};

export async function attachAgentImageFiles({
  sessionId,
  files,
  importLocalImageToHistory,
  applyWorkspace,
}: AttachAgentImageFilesInput): Promise<void> {
  for (const file of files) {
    const item = await importLocalImageToHistory(file);
    const currentImage = item ? imageHandleFromCurrent(item) : null;
    if (!currentImage) continue;
    const payload = await updateAgentSession(sessionId, { currentImage });
    applyWorkspace(payload);
  }
}
