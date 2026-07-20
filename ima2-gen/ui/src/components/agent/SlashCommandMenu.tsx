import { useI18n } from "../../i18n";
import { filterCommands, type SlashCommandDef } from "./slashCommands";

type Props = {
  listboxId: string;
  query: string;
  highlightIndex: number;
  onSelect: (cmd: SlashCommandDef) => void;
  onHighlightChange: (index: number) => void;
};

export function SlashCommandMenu({ listboxId, query, highlightIndex, onSelect, onHighlightChange }: Props) {
  const { t } = useI18n();
  const filtered = filterCommands(query);
  if (filtered.length === 0) return null;

  return (
    <ul
      id={listboxId}
      className="slash-command-menu"
      role="listbox"
      aria-label={t("agent.slashCommands")}
    >
      {filtered.map((cmd, i) => (
        <li
          key={cmd.name}
          id={`${listboxId}-opt-${i}`}
          role="option"
          aria-selected={i === highlightIndex}
          className={`slash-command-menu__item${i === highlightIndex ? " is-highlighted" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => onHighlightChange(i)}
        >
          <span className="slash-command-menu__name">{cmd.display}</span>
          <span className="slash-command-menu__desc">{t(cmd.descriptionKey)}</span>
        </li>
      ))}
    </ul>
  );
}
