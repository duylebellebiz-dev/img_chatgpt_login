import { REASONING_EFFORT_OPTIONS, type ReasoningEffort } from "../lib/reasoning";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { Select } from "./controls";

export function ReasoningEffortSelect() {
  const { t } = useI18n();
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const setReasoningEffort = useAppStore((s) => s.setReasoningEffort);

  const items = REASONING_EFFORT_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.fullLabelKey),
  }));

  return (
    <div className="ctl-select-wrap settings-reasoning-effort">
      <Select<ReasoningEffort>
        id="settings-reasoning-effort"
        items={items}
        value={reasoningEffort}
        onChange={setReasoningEffort}
      />
    </div>
  );
}
