import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import type { HistoryStripLayout } from "../types";
import { Segmented } from "./controls";

const OPTIONS: HistoryStripLayout[] = ["rail", "horizontal", "sidebar"];

export function HistoryStripLayoutToggle() {
  const { t } = useI18n();
  const layout = useAppStore((s) => s.historyStripLayout);
  const setLayout = useAppStore((s) => s.setHistoryStripLayout);

  return (
    <Segmented<HistoryStripLayout>
      className="history-layout-toggle"
      items={OPTIONS.map((option) => ({
        value: option,
        label: t(`settings.appearance.historyStripLayout.${option}`),
      }))}
      value={layout}
      onChange={setLayout}
    />
  );
}
