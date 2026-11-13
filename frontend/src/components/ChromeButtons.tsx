"use client";

import { useCallback } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { useIsMobile } from "@/hooks/useIsMobile";
import { DriveTreeToggle } from "./DriveTreeToggle";
import { useFileHeaderRowHost } from "./FileHeaderRowProvider";
import { useSidebar } from "./SidebarProvider";

function MenuButton() {
  const { toggle, isOpen } = useSidebar();
  const t = useTranslations("header");
  return (
    <button
      onClick={toggle}
      aria-label={t("menu")}
      // The sidebar and the tree are the two surfaces that name where you
      // are, and only one of them holds that job at a time, so both
      // controls have to say which.
      aria-pressed={isOpen}
      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors hover:bg-bg-elevated hover:text-text-primary ${
        isOpen ? "bg-bg-elevated text-text-primary" : "text-text-muted"
      }`}
    >
      <Menu size={20} />
    </button>
  );
}

/**
 * One row, so the tree toggle is placed by the menu button rather than by a
 * copy of its geometry.
 *
 * PWA safe-area: when iOS runs in standalone mode the viewport can extend
 * under the status bar, so the row is anchored to the safe-area top + 8px
 * instead of a raw 8px offset. In a regular browser `safe-area-inset-top`
 * resolves to 0. 8px puts the 40px buttons on the 56px header's centre line,
 * which the header's controls and a file page's trail share.
 */
export function ChromeButtons() {
  const rowHost = useFileHeaderRowHost();
  const setChromeButtons = rowHost?.setChromeButtons;
  const attach = useCallback(
    (node: HTMLDivElement | null) => setChromeButtons?.(node),
    [setChromeButtons],
  );
  // The tree has no width beside a file on a phone, so its toggle would do
  // nothing there.
  const isMobile = useIsMobile();
  const hideTree = !!rowHost?.top && isMobile;

  return (
    <div
      ref={attach}
      data-testid="chrome-buttons"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      className="fixed left-3 z-50 flex items-center gap-2"
    >
      <MenuButton />
      {!hideTree && <DriveTreeToggle />}
    </div>
  );
}
