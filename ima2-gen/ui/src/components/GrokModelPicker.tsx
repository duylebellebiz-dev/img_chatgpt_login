import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import type { ImageModel } from "../types";
import { Segmented } from "./controls";

const GROK_MODELS: Array<{ value: ImageModel; label: string; sub: string }> = [
  { value: "grok-imagine-image", label: "Grok", sub: "Fast" },
  { value: "grok-imagine-image-quality", label: "Grok+", sub: "Best" },
];

export function GrokModelPicker() {
  const { t } = useI18n();
  const imageModel = useAppStore((s) => s.imageModel);
  const setImageModel = useAppStore((s) => s.setImageModel);

  return (
    <Segmented<ImageModel>
      title={t("quality.grokModelTitle")}
      items={GROK_MODELS}
      value={imageModel}
      onChange={setImageModel}
    />
  );
}
