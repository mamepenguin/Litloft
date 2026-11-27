"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { useTreeVisible } from "@/hooks/useTreeVisible";
import { toggleFocusMode, useFocusLayout } from "@/hooks/useFocusMode";
import { routeHidesTree } from "@/lib/driveViews";
import {
  queuePagePresent,
  subscribeQueuePage,
} from "@/components/queue/queuePagePresence";

interface TreeToggleProps {
  drive: string;
  visible?: boolean;
}

export function TreeToggle({ drive, visible = true }: TreeToggleProps) {
  const t = useTranslations("view");
  const tPlayback = useTranslations("playback");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queueShown = useSyncExternalStore(
    subscribeQueuePage,
    () => queuePagePresent(drive),
    () => false,
  );
  // The effective state, not the stored one. Below `md` a stored "on" is
  // suppressed.
  const { visible: treeVisible, toggle } = useTreeVisible(drive);
  // The focus layout gives the pane's width to the page, so the button
  // reports the pane as hidden there and a press has to end that layout
  // before its ordinary press means anything.
  const focusLayout = useFocusLayout();
  const shown = treeVisible && !focusLayout;
  const handleToggle = () => {
    if (focusLayout) {
      toggleFocusMode();
      // The layout leaving produces shows the pane: the press has already
      // done what it was for, and the ordinary press would hide it again.
      if (treeVisible) return;
    }
    toggle();
  };

  if (!visible) return null;
  if (!pathname.startsWith("/drive/")) return null;
  if (routeHidesTree({ pathname, view: searchParams.get("view"), includeStandalone: true })) return null;

  // A queue page's pane is the queue, so the button says so.
  const onQueuePage = searchParams.get("queue") !== null || queueShown;

  // Below `md` an open file hides the pane; pressing the toggle there changes
  // nothing on screen and only arms a full-viewport tree for when it closes.
  // A queue page's pane is what the button is for, so it stays there.
  const display =
    searchParams.get("file") !== null && !onQueuePage
      ? "hidden md:flex"
      : "flex";

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={shown}
      aria-label={
        onQueuePage
          ? shown
            ? tPlayback("queueHide")
            : tPlayback("queueShow")
          : shown
            ? t("treeOff")
            : t("treeOn")
      }
      title={
        onQueuePage
          ? shown
            ? tPlayback("queueHide")
            : tPlayback("queueShow")
          : shown
            ? t("treeOff")
            : t("treeOn")
      }
      className={`${display} h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl transition-colors hover:bg-bg-elevated hover:text-text-primary ${
        shown ? "bg-bg-elevated text-text-primary" : "text-text-muted"
      }`}
    >
      {shown ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
    </button>
  );
}
