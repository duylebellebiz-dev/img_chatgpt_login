import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { AgentMessage } from "./AgentMessage";
import { AgentRunGroup } from "./AgentRunGroup";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

type MessageGroup =
  | { kind: "single"; turn: AgentTurn }
  | { kind: "run"; turns: AgentTurn[]; key: string };

function groupTurns(turns: AgentTurn[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let runBatch: AgentTurn[] = [];

  const flushRun = () => {
    if (runBatch.length === 0) return;
    groups.push({ kind: "run", turns: runBatch, key: runBatch.map((t) => t.id).join("+") });
    runBatch = [];
  };

  for (const turn of turns) {
    if (turn.role === "user") {
      flushRun();
      groups.push({ kind: "single", turn });
    } else {
      runBatch.push(turn);
    }
  }
  flushRun();
  return groups;
}

export function AgentMessageList({ turns, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const groups = useMemo(() => groupTurns(turns), [turns]);

  const updateScrollPosition = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
    if (nearBottomRef.current) setShowJump(false);
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setShowJump(false);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
    else setShowJump(true);
  }, [turns.length]);

  return (
    <div ref={listRef} className="agent-message-list" aria-live="polite" onScroll={updateScrollPosition}>
      {turns.length === 0 ? <div className="agent-message-list__empty">{t("agent.emptyChat")}</div> : null}
      {groups.map((group) =>
        group.kind === "run" ? (
          <AgentRunGroup key={group.key} turns={group.turns} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
        ) : (
          <AgentMessage key={group.turn.id} turn={group.turn} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
        ),
      )}
      {showJump ? <button type="button" className="agent-message-list__jump" onClick={jumpToLatest}>{t("agent.emptyJumpLatest")}</button> : null}
    </div>
  );
}
