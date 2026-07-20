import { useI18n } from "../../i18n";
import { MAX_AGENT_PARALLELISM, MAX_AGENT_VARIANTS } from "../../lib/agentGenerationSettings";
import type { AgentGenerationSettings } from "./agentTypes";

type Props = {
  settings: AgentGenerationSettings;
  onChange: (patch: Partial<AgentGenerationSettings>) => void;
};

type SegmentOption<T extends string> = { value: T; label: string };

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="agent-settings-grid__field">
      <span>{label}</span>
      <div className="agent-segment-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="agent-settings-grid__field">
      <span>{label}</span>
      <div className="agent-stepper" role="group" aria-label={label}>
        <button type="button" aria-label={`${label} -`} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>-</button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

export function AgentQualityPanel({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-settings-grid" aria-label={t("agent.quality")}>
      <SegmentedControl label={t("agent.generationStrategy")} value={settings.generationStrategy} options={[
        { value: "auto", label: t("agent.generationStrategyAuto") },
        { value: "manual", label: t("agent.generationStrategyManual") },
      ]} onChange={(generationStrategy) => onChange({ generationStrategy })} />
      <SegmentedControl label={t("agent.quality")} value={settings.quality} options={[
        { value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" },
      ]} onChange={(quality) => onChange({ quality })} />
      <SegmentedControl label={t("agent.size")} value={settings.size} options={[
        { value: "1024x1024", label: "1:1" }, { value: "1536x1024", label: "3:2" },
        { value: "1024x1536", label: "2:3" }, { value: "2048x2048", label: "2K" },
      ]} onChange={(size) => onChange({ size })} />
      <SegmentedControl label={t("agent.format")} value={settings.format} options={[
        { value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" },
      ]} onChange={(format) => onChange({ format })} />
      <SegmentedControl label={t("agent.moderation")} value={settings.moderation} options={[
        { value: "auto", label: "auto" }, { value: "low", label: "low" },
      ]} onChange={(moderation) => onChange({ moderation })} />
      {settings.generationStrategy === "manual" ? (
        <Stepper label={t("agent.variantsCount")} value={settings.variants} max={MAX_AGENT_VARIANTS} onChange={(variants) => onChange({ variants })} />
      ) : (
        <Stepper label={t("agent.maxAutoVariants")} value={settings.maxAutoVariants} max={MAX_AGENT_VARIANTS} onChange={(maxAutoVariants) => onChange({ maxAutoVariants })} />
      )}
      <Stepper label={t("agent.parallelism")} value={settings.parallelism} max={MAX_AGENT_PARALLELISM} onChange={(parallelism) => onChange({ parallelism })} />
    </section>
  );
}
