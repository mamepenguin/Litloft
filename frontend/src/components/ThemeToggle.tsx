"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const options = [
  { value: "system" as const, icon: Monitor, label: "システム" },
  { value: "light" as const, icon: Sun, label: "ライト" },
  { value: "dark" as const, icon: Moon, label: "ダーク" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-bg-elevated p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          title={label}
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
