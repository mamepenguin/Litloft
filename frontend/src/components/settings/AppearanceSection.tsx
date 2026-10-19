"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";
import { PreferenceRow } from "./PreferenceRow";

type Theme = "system" | "light" | "dark";

interface ThemeOption {
  value: Theme;
  icon: LucideIcon;
  labelKey: "system" | "light" | "dark";
}

const OPTIONS: ReadonlyArray<ThemeOption> = [
  { value: "system", icon: Monitor, labelKey: "system" },
  { value: "light", icon: Sun, labelKey: "light" },
  { value: "dark", icon: Moon, labelKey: "dark" },
];

export function AppearanceSection() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();

  return (
    <PreferenceRow id="settings-appearance" label={t("title")}>
      {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-colors ${
              active
                ? // Selected state is a border, not a fill: the accent fill
                  // is kept for the page's one call to action.
                  "border-accent bg-bg-elevated text-text-primary"
                : "border-bg-border bg-bg-card text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{t(labelKey)}</span>
          </button>
        );
      })}
    </PreferenceRow>
  );
}
