import type { MouseEvent } from "react";
import { useCardNewsStore } from "../../store/cardNewsStore";
import { useAppStore } from "../../store/useAppStore";
import { cardNewsManifestDownloadUrl } from "../../lib/cardNewsApi";
import type { GenerateItem } from "../../types";

export function useCardNewsActions(
  close: () => void,
  showToast: (msg: string, isError?: boolean) => void,
  t: (key: string) => string,
) {
  async function handleOpenCardNewsSet(item: GenerateItem) {
    if (!item.setId) return;
    try {
      await useCardNewsStore.getState().loadSet(item.setId);
      useAppStore.getState().setUIMode("card-news");
      close();
    } catch {
      showToast(t("gallery.openCardNewsSetFailed"), true);
    }
  }

  async function handleCopyCardNewsSetPath(item: GenerateItem, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!item.setId) return;
    const path = `generated/cardnews/${item.setId}`;
    try {
      await navigator.clipboard?.writeText(path);
      showToast(t("gallery.cardNewsPathCopied"));
    } catch {
      showToast(t("toast.copyFailed"), true);
    }
  }

  function handleDownloadCardNewsManifest(item: GenerateItem, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!item.setId) return;
    window.open(cardNewsManifestDownloadUrl(item.setId), "_blank", "noopener,noreferrer");
  }

  return { handleOpenCardNewsSet, handleCopyCardNewsSetPath, handleDownloadCardNewsManifest };
}
