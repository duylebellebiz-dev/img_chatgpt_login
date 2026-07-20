import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";

type Props = {
  mode: "library" | "forms";
  onInsert: (text: string) => void;
};

export function AgentPromptLibraryPanel({ mode, onInsert }: Props) {
  const { t } = useI18n();
  const library = useAppStore((s) => s.promptLibrary);
  const loading = useAppStore((s) => s.promptLibraryLoading);
  const load = useAppStore((s) => s.loadPromptLibrary);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return library.prompts.filter((prompt) => {
      const tags = prompt.tags.map((tag) => tag.toLowerCase());
      if (mode === "forms" && !tags.includes("agent:form")) return false;
      if (!term) return true;
      return (
        prompt.name.toLowerCase().includes(term) ||
        prompt.text.toLowerCase().includes(term) ||
        tags.some((tag) => tag.includes(term))
      );
    });
  }, [library.prompts, mode, search]);

  return (
    <section className="agent-sidebar-section" aria-label={mode === "forms" ? t("agent.forms") : t("agent.promptLibrary")}>
      <header>
        <div>
          <span>{mode === "forms" ? t("agent.forms") : t("agent.promptLibrary")}</span>
          <strong>{filtered.length}</strong>
        </div>
      </header>
      <label className="agent-sidebar-search">
        <span>{t("promptLibrary.search")}</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("promptLibrary.search")} />
      </label>
      <div className="agent-prompt-library-list">
        {loading ? <div className="agent-tab-empty">{t("common.loading")}</div> : null}
        {!loading && filtered.length === 0 ? <div className="agent-tab-empty">{mode === "forms" ? t("agent.noForms") : t("promptLibrary.empty")}</div> : null}
        {filtered.map((prompt) => (
          <article key={prompt.id} className="agent-prompt-library-row">
            <strong>{prompt.name || t("promptLibrary.untitled")}</strong>
            <p>{prompt.text}</p>
            <button type="button" onClick={() => onInsert(prompt.text)}>{t("agent.insertPrompt")}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
