"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import type { NativePlayerUi } from "@/lib/nativePlayerUi";

interface NativePlayerUiToggleProps {
  ui: NativePlayerUi;
  onChange: (ui: NativePlayerUi) => void;
}

export function NativePlayerUiToggle({
  ui,
  onChange,
}: NativePlayerUiToggleProps) {
  const t = useTranslations("player");
  const browser = ui === "browser";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="px-1 text-sm">{t("playerControls")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={browser}
        aria-label={t("playerControls")}
        onClick={() => onChange(browser ? "litloft" : "browser")}
        className={[
          "inline-flex h-11 items-center justify-center gap-1 rounded-2xl px-3 text-sm",
          "transition-colors motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          browser ? "bg-white/20 font-medium" : "hover:bg-white/10",
        ].join(" ")}
      >
        {browser && <Check size={14} aria-hidden="true" />}
        {browser ? t("browserControls") : t("litloftControls")}
      </button>
    </div>
  );
}
