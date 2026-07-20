import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSourceTree } from "./_readTree.mjs";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("provider UI contract", () => {
  it("renders provider selection as logo-free compact pills", () => {
    const select = readSource("ui/src/components/ProviderSelect.tsx");

    assert.match(select, /const GRID/);
    assert.match(select, /provider-pill/);
    assert.match(select, /status-dot/);
    assert.match(select, /value: "grok-api"/);
    assert.match(select, /value: "gemini-api"/);
    assert.match(select, /setProvider\(cell\.value\)/);
    assert.doesNotMatch(select, /ProviderCard/);
    assert.doesNotMatch(select, /getProviderIdentity/);
  });

  it("owns logo-free provider pill styles outside toast-modal css", () => {
    const indexCss = readSourceTree("ui/src/index.css");
    const providerCss = readSource("ui/src/styles/provider-controls.css");
    const toastCss = readSource("ui/src/styles/toast-modal.css");

    assert.match(indexCss, /@import "\.\/styles\/provider-controls\.css";/);
    assert.match(providerCss, /\.provider-pill/);
    assert.match(providerCss, /\.provider-pill\.selected/);
    assert.match(providerCss, /\.status-dot--ok/);
    assert.match(providerCss, /\.status-dot--bad/);
    assert.doesNotMatch(providerCss, /provider-card/);
    assert.doesNotMatch(providerCss, /provider-card__mark/);
    assert.doesNotMatch(toastCss, /\.provider-grid/);
  });

  it("keeps provider pills accessible and stable", () => {
    const select = readSource("ui/src/components/ProviderSelect.tsx");
    const css = readSource("ui/src/styles/provider-controls.css");

    assert.match(select, /type="button"/);
    assert.match(select, /aria-label=/);
    assert.match(select, /aria-pressed=\{selected\}/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /:focus-visible/);
  });

  it("keeps Agent mode model control on the existing dropdown pattern", () => {
    const agent = readSource("ui/src/components/agent/AgentModelSelector.tsx");
    const css = readSource("ui/src/styles/provider-controls.css");

    assert.match(agent, /image-model-select__trigger--pill/);
    assert.match(agent, /image-model-select__menu/);
    assert.match(agent, /AGENT_LLM_MODEL_OPTIONS/);
    assert.match(agent, /getAgentLlmModelOption/);
    assert.match(agent, /REASONING_EFFORT_OPTIONS/);
    assert.match(agent, /provider: option\.provider/);
    assert.doesNotMatch(agent, /OPENAI_IMAGE_MODEL_OPTIONS/);
    assert.doesNotMatch(agent, /<select value=\{settings\.provider\}/);
    assert.doesNotMatch(agent, /ProviderCard/);
    assert.doesNotMatch(agent, /getProviderIdentity/);
    assert.doesNotMatch(agent, /agent-provider-options/);
    assert.doesNotMatch(css, /\.agent-provider-options/);
  });

  it("moves Gemini API compatibility copy and grid layout out of inline React branches", () => {
    const controls = readSource("ui/src/components/GenerationControlsPanel.tsx");
    const settings = readSource("ui/src/components/SettingsWorkspace.tsx");
    const css = readSource("ui/src/styles/provider-controls.css");
    const en = readSource("ui/src/i18n/en.json");
    const ko = readSource("ui/src/i18n/ko.json");

    assert.match(controls, /providerCompat/);
    assert.match(controls, /t\("provider\.geminiApiCompatTitle"\)/);
    assert.match(controls, /t\("provider\.geminiApiCompatBody"\)/);
    assert.match(controls, /OptionGroup<GeminiImageModel>/);
    assert.match(controls, /className="gemini-resolution-grid"/);
    assert.doesNotMatch(controls, /Google Gemini API\. Supports aspect ratio/);
    assert.doesNotMatch(controls, /style=\{\{ lineHeight/);
    assert.doesNotMatch(controls, /gridTemplateColumns/);
    assert.match(settings, /t\("provider\.geminiApiCompatBodyLong"\)/);
    assert.doesNotMatch(settings, /Google Gemini API direct/);
    assert.match(css, /\.gemini-resolution-grid/);
    assert.match(en, /"geminiApiCompatBody"/);
    assert.match(ko, /"geminiApiCompatBody"/);
  });
});
