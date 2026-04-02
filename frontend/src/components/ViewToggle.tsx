"use client";

import { Grid3X3, List } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "@/types";

const STORAGE_KEY = "video-share-view-mode";

export function ViewToggle({
  onChange,
}: {
  onChange: (mode: ViewMode) => void;
}) {
  const t = useTranslations("view");
  const [mode, setMode] = useState<ViewMode>("grid");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (saved === "grid" || saved === "list") {
      setMode(saved);
      onChange(saved);
    }
  }, [onChange]);

  function toggle(newMode: ViewMode) {
    setMode(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    onChange(newMode);
  }

  return (
    <div className="flex gap-1">
      <button
        onClick={() => toggle("grid")}
        className={`rounded-md p-2 transition-colors ${
          mode === "grid"
            ? "bg-accent text-white"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label={t("grid")}
      >
        <Grid3X3 size={18} />
      </button>
      <button
        onClick={() => toggle("list")}
        className={`rounded-md p-2 transition-colors ${
          mode === "list"
            ? "bg-accent text-white"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label={t("list")}
      >
        <List size={18} />
      </button>
    </div>
  );
}
