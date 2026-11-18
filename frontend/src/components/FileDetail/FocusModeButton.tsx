"use client";

import { Focus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFocusState, toggleFocusMode } from "@/hooks/useFocusMode";

/** The inspector toggle's shape, one step wider in what it changes. */
export function FocusModeButton() {
  const t = useTranslations("focusMode");
  const pressed = useFocusState();
  const label = pressed ? t("exit") : t("enter");

  return (
    <button
      type="button"
      onClick={() => toggleFocusMode()}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      data-testid="focus-mode-toggle"
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-bg-border hover:text-text-primary ${
        pressed ? "bg-bg-elevated text-text-primary" : "text-text-muted"
      }`}
    >
      <Focus size={16} />
    </button>
  );
}
