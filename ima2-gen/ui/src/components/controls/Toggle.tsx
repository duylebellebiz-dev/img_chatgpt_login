import type { ReactNode } from "react";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Toggle — switch for a genuine on/off (Phase 020 kit). Multi-value choices
 * belong in Segmented or Select, never a toggle.
 */
export function Toggle({ checked, onChange, label, ariaLabel, className, disabled, id }: Props) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`ctl-toggle${checked ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ctl-toggle__track" aria-hidden="true">
        <span className="ctl-toggle__thumb" />
      </span>
      {label ? <span className="ctl-toggle__label">{label}</span> : null}
    </button>
  );
}
