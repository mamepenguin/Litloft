"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { DriveTreeToggle } from "./DriveTreeToggle";
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
 * under the status bar, so the row is anchored to the safe-area top + 12px
 * instead of a raw 12px offset. In a regular browser `safe-area-inset-top`
 * resolves to 0.
 */
export function ChromeButtons() {
  return (
    <div
      data-testid="chrome-buttons"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      className="fixed left-3 z-50 flex items-center gap-2"
    >
      <MenuButton />
      <DriveTreeToggle />
    </div>
  );
}
