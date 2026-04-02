"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");

  const options = [
    { value: "system" as const, icon: Monitor, labelKey: "system" },
    { value: "light" as const, icon: Sun, labelKey: "light" },
    { value: "dark" as const, icon: Moon, labelKey: "dark" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-bg-elevated p-0.5">
      {options.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          className={`rounded-md p-1.5 transition-colors ${
            theme === value
              ? "bg-bg-card text-accent shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
