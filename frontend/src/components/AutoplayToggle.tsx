"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAutoplayPreference } from "@/lib/autoplay";

export function AutoplayToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("player");
  const [enabled, setEnabled] = useAutoplayPreference();
  const label = enabled ? t("autoplayOn") : t("autoplayOff");

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-full p-1.5 text-[11px] font-medium transition-colors md:px-2 md:py-1 ${
        enabled
          ? "bg-accent text-white hover:bg-accent-hover"
          : "bg-bg-card text-text-muted hover:text-text-primary"
      } ${className}`}
    >
      <Play size={12} className={enabled ? "fill-current" : ""} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
