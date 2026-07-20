import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type SelectItem<V extends string> = {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
};

type Props<V extends string> = {
  items: ReadonlyArray<SelectItem<V>>;
  value: V;
  onChange: (v: V) => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
};

/**
 * Select — glass dropdown listbox (Phase 020 kit). Replaces native <select>
 * where item metadata (sub text) matters. Full keyboard support:
 * Enter/Space/ArrowDown open, Arrow keys move, Enter selects, Escape closes.
 */
export function Select<V extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  id,
  disabled,
}: Props<V>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, items.findIndex((it) => it.value === value)),
  );

  const selected = items.find((it) => it.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    setActiveIndex(Math.max(0, items.findIndex((it) => it.value === value)));
    setOpen(true);
  };

  const move = (step: number) => {
    let next = activeIndex;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + step + items.length) % items.length;
      if (!items[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  const commit = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onChange(item.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`ctl-select${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`ctl-select__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ctl-select__value">{selected?.label ?? ""}</span>
        {selected?.sub ? <span className="ctl-select__value-sub">{selected.sub}</span> : null}
        <svg
          className="ctl-select__caret"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open ? (
        <ul className="ctl-select__list" role="listbox" id={listId} ref={listRef}>
          {items.map((it, index) => (
            <li
              key={it.value}
              role="option"
              data-index={index}
              aria-selected={it.value === value}
              aria-disabled={it.disabled || undefined}
              className={`ctl-select__item${it.value === value ? " is-selected" : ""}${
                index === activeIndex ? " is-active" : ""
              }${it.disabled ? " is-disabled" : ""}`}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="ctl-select__item-label">{it.label}</span>
              {it.sub ? <span className="ctl-select__item-sub">{it.sub}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
