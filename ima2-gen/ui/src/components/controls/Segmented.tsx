import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type SegmentedItem<V extends string> = {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  color?: string;
  disabled?: boolean;
};

type Props<V extends string> = {
  title?: string;
  help?: ReactNode;
  items: ReadonlyArray<SegmentedItem<V>>;
  value: V;
  onChange: (v: V) => void;
  className?: string;
};

/**
 * Segmented — canonical 2~4-choice control (Phase 020 kit).
 * Keeps the legacy OptionGroup contract and classnames so existing consumers,
 * mobile CSS, and contract tests continue to work; adds arrow-key navigation.
 */
export function Segmented<V extends string>({
  title,
  help,
  items,
  value,
  onChange,
  className,
}: Props<V>) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const enabled = items.filter((it) => !it.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((it) => it.value === value);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = enabled[(current + step + enabled.length) % enabled.length];
    event.preventDefault();
    onChange(next.value);
    rowRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  };

  return (
    <div className={`option-group${className ? ` ${className}` : ""}`}>
      {title ? <div className="section-title">{title}</div> : null}
      <div className="option-row" role="group" ref={rowRef} onKeyDown={onKeyDown}>
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            data-value={it.value}
            className={`option-btn${it.value === value ? " active" : ""}`}
            style={it.color ? { color: it.color } : undefined}
            disabled={it.disabled}
            aria-pressed={it.value === value}
            onClick={() => onChange(it.value)}
          >
            {it.label}
            {it.sub ? (
              <>
                <br />
                <span className="option-sub">{it.sub}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      {help ? <p className="option-help">{help}</p> : null}
    </div>
  );
}
