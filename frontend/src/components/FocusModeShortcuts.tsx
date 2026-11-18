"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";
import { toggleFocusMode } from "@/hooks/useFocusMode";
import { canTakeFocusModeShortcut, isHeaderMenuOpen } from "@/lib/findShortcut";

/**
 * Lives under the shell's own `ShortcutsProvider`, so the sheet lists it with
 * the rest of the page's keys. Registered on every file page, at any width:
 * `T` sets the state on a phone too, where the layout stays the phone's.
 */
export function FocusModeShortcuts({ active }: { active: boolean }) {
  const t = useTranslations("focusMode");
  const shortcuts = useMemo(
    () => [
      {
        key: "t",
        label: t("toggle"),
        handler: () => toggleFocusMode(),
        // A header menu suppresses the press rather than closing: the press
        // is meant for the listing the menu opened.
        when: () => !isHeaderMenuOpen() && canTakeFocusModeShortcut(),
      },
    ],
    [t],
  );
  useShortcuts("focus-mode", t("title"), shortcuts, active);
  return null;
}
