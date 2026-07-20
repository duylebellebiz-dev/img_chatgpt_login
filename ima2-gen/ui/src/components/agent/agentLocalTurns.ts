import type { AgentTurn } from "./agentTypes";

export const LOCAL_TURN_PREFIX = "agent-local-";
export const PENDING_TURN_PREFIX = `${LOCAL_TURN_PREFIX}pending-`;

let localTurnSequence = 0;

function nextLocalTurnId(kind: string): string {
  localTurnSequence += 1;
  return `${LOCAL_TURN_PREFIX}${kind}-${Date.now()}-${localTurnSequence}`;
}

export function isLocalTurn(turn: AgentTurn): boolean {
  return turn.id.startsWith(LOCAL_TURN_PREFIX);
}

export function isLocalPendingTurn(turn: AgentTurn): boolean {
  return turn.id.startsWith(PENDING_TURN_PREFIX);
}

export function localUserTurn(text: string, createdAt: number): AgentTurn {
  return {
    id: nextLocalTurnId("user"),
    role: "user",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "complete",
    createdAt,
  };
}

export function localPendingTurn(text: string, createdAt: number): AgentTurn {
  return {
    id: nextLocalTurnId("pending"),
    role: "assistant",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "streaming",
    createdAt,
  };
}

export function localErrorTurn(text: string): AgentTurn {
  return {
    id: nextLocalTurnId("error"),
    role: "assistant",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "error",
    createdAt: Date.now(),
  };
}
