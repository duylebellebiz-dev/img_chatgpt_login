import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("Agent Mode layout contract", () => {
  it("resolves layout purely by viewport dimensions (auto only)", () => {
    const layout = readSource("ui/src/lib/agentLayout.ts");
    const hook = readSource("ui/src/hooks/useAgentWorkspaceLayout.ts");
    const workspace = readSource("ui/src/components/agent/AgentWorkspace.tsx");
    const css = readSource("ui/src/styles/agent-workspace.css");

    assert.match(layout, /export function resolveAgentLayout/);
    assert.match(layout, /desktop-three-pane/);
    assert.match(layout, /desktop-rail/);
    assert.match(layout, /tablet-stacked/);
    assert.match(layout, /mobile-chat-image-sheet/);
    assert.match(hook, /resolveAgentLayout\(/);
    assert.match(hook, /getAgentWorkspaceWidth/);
    assert.match(hook, /querySelector<HTMLElement>/);
    assert.match(hook, /\.app\[data-ui-mode=/);
    assert.match(hook, /\.sidebar/);
    assert.match(hook, /window\.innerWidth - width/);
    assert.match(workspace, /useAgentWorkspaceLayout/);
    assert.match(css, /grid-template-columns: 260px minmax\(0, 1fr\)/);
    assert.match(css, /\.agent-workspace\s*\{[\s\S]*?grid-column: 1;/);
    assert.match(css, /\.agent-session-sidebar\s*\{[\s\S]*?grid-column: 1;/);
    assert.match(css, /\.agent-workspace__body\s*\{[\s\S]*?grid-column: 2;/);
    assert.match(css, /grid-template-columns: minmax\(420px, 0\.95fr\) minmax\(520px, 1\.05fr\)/);
    assert.match(css, /grid-template-columns: minmax\(420px, 1fr\) minmax\(440px, 1fr\)/);
  });

  it("does not have pane switcher or sidebar collapse toggle", () => {
    const topbar = readSource("ui/src/components/agent/AgentTopBar.tsx");
    const sidebar = readSource("ui/src/components/agent/AgentSessionSidebar.tsx");
    const css = readSource("ui/src/styles/agent-workspace.css");

    assert.doesNotMatch(topbar, /AgentPaneToggle/);
    assert.doesNotMatch(sidebar, /AgentPaneToggle/);
    assert.doesNotMatch(topbar, /UIModeSwitch/);
    assert.doesNotMatch(sidebar, /UIModeSwitch/);
    assert.doesNotMatch(topbar, /onToggleSidebar/);
    assert.doesNotMatch(sidebar, /onCollapse/);
    assert.doesNotMatch(css, /agent-workspace--collapsed/);
  });
});
