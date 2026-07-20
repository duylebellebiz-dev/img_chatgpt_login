import { useAppStore } from "../../store/useAppStore";
import { usePromptBuilderStore } from "../../store/promptBuilderStore";
import { useI18n } from "../../i18n";
import type { GenerateItem } from "../../types";

function getImageKey(item: GenerateItem | null | undefined): string | null {
  return item?.filename ?? item?.url ?? item?.image ?? null;
}

function formatScopeImageName(imageKey: string): string {
  const trimmed = imageKey.split(/[\\/]/).pop() ?? imageKey;
  if (trimmed.length <= 32) return trimmed;
  return `${trimmed.slice(0, 14)}...${trimmed.slice(-12)}`;
}

export function PromptBuilderScopeBadge() {
  const scope = usePromptBuilderStore((s) => s.scope);
  const clearScope = usePromptBuilderStore((s) => s.clearImageScope);
  const currentImage = useAppStore((s) => s.currentImage);
  const history = useAppStore((s) => s.history);
  const { t } = useI18n();

  if (scope.kind === "draft") {
    return <span className="prompt-builder__scope">{t("promptBuilder.scopeDraft")}</span>;
  }

  const currentKey = getImageKey(currentImage);
  const scopeImage =
    currentKey === scope.imageKey
      ? currentImage
      : history.find((item) => getImageKey(item) === scope.imageKey) ?? null;

  if (!scopeImage) {
    return <span className="prompt-builder__scope">{t("promptBuilder.scopeDraft")}</span>;
  }

  const label = t("promptBuilder.scopeImage", {
    name: formatScopeImageName(scope.imageKey) || t("promptBuilder.scopeImageFallback"),
  });

  return (
    <div className="prompt-builder__scope-card">
      <img
        className="prompt-builder__scope-thumb"
        src={scopeImage.thumb || scopeImage.url || scopeImage.image}
        alt=""
      />
      <span className="prompt-builder__scope-name">{label}</span>
      <button
        type="button"
        className="prompt-builder__scope-remove"
        onClick={clearScope}
        aria-label={t("promptBuilder.removeScopeImage")}
        title={t("promptBuilder.removeScopeImage")}
      >
        ×
      </button>
    </div>
  );
}
