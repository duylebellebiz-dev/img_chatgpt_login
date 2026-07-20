import { useEffect, useState } from "react";
import type { AgentLayoutMode } from "../components/agent/agentTypes";
import { resolveAgentLayout } from "../lib/agentLayout";

function getWindowWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

function getWindowHeight(): number {
  return typeof window === "undefined" ? 900 : window.innerHeight;
}

function getAgentWorkspaceWidth(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 1440;
  const sidebar = document.querySelector<HTMLElement>(".app[data-ui-mode=\"agent\"] .sidebar");
  if (!sidebar) return window.innerWidth;
  const style = window.getComputedStyle(sidebar);
  if (style.display === "none" || style.visibility === "hidden") return window.innerWidth;
  const width = sidebar.getBoundingClientRect().width;
  return Math.max(0, window.innerWidth - width);
}

export function useAgentWorkspaceLayout(): AgentLayoutMode {
  const [layout, setLayout] = useState<AgentLayoutMode>(() =>
    resolveAgentLayout({ width: getWindowWidth(), height: getWindowHeight() }),
  );

  useEffect(() => {
    const update = () => setLayout(resolveAgentLayout({
      width: getAgentWorkspaceWidth(),
      height: getWindowHeight(),
    }));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}
