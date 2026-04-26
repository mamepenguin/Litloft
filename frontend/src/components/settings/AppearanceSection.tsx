"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";

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
    <section
      aria-labelledby="settings-appearance-title"
      className="rounded-xl border border-bg-border bg-bg-card p-6"
    >
      <h2
        id="settings-appearance-title"
        className="mb-4 text-base font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <div className="flex flex-wrap gap-2">
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
                  ? "border-accent bg-accent text-white"
                  : "border-bg-border bg-bg-card text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
