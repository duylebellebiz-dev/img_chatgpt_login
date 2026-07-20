import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { HomeRecentRow } from "./HomeRecentRow";
import { HomePromptComposer } from "./HomePromptComposer";
import { PresetGrid } from "./PresetGrid";
import "../../styles/home-workspace.css";

export function HomeWorkspace() {
  const { t } = useI18n();
  const history = useAppStore((state) => state.history);
  const hasHistory = history.length > 0;

  return (
    <section className="home-workspace" aria-label={t("nav.home")}>
      <div className="home-workspace__inner">
        <div className="home-workspace__brand">
          <span className="home-chrome-logo">ima2</span>
        </div>
        <div className="home-workspace__composer">
          <HomePromptComposer />
        </div>
        {hasHistory && (
          <div className="home-workspace__recent">
            <h2>{t("home.recentTitle")}</h2>
            <HomeRecentRow />
          </div>
        )}
        <div className="home-workspace__presets">
          <PresetGrid />
        </div>
        <div className="home-workspace__wordmark" aria-hidden="true">
          IMA2
        </div>
      </div>
    </section>
  );
}
