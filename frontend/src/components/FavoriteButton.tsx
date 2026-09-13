"use client";

import { Star } from "lucide-react";

import { useTranslations } from "next-intl";
import { useOptimisticFileToggle } from "@/hooks/useOptimisticFileToggle";
import { toggleFavorite } from "@/lib/api";
import type { FileItem } from "@/types";

import { ROW_ACTION_FLOOR } from "./rowFurniture";

export function FavoriteButton({
  fileId,
  isFavorite,
  onToggle,
  size = "sm",
  showLabel = false,
  entityName,
  rowAction = false,
}: {
  fileId: string;
  isFavorite: boolean;
  onToggle: (file: FileItem) => void;
  size?: "sm" | "md";
  showLabel?: boolean;
  entityName?: string;
  rowAction?: boolean;
}) {
  const t = useTranslations("favorite");
  const { current, iconRef, toggle } = useOptimisticFileToggle({
    value: isFavorite,
    mutate: () => toggleFavorite(fileId),
    onToggle,
  });

  const iconSize = size === "sm" ? 16 : 18;

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 transition-colors ${
        showLabel
          ? "rounded-full bg-bg-card px-3 py-1.5 text-sm"
          : "rounded-lg p-1.5"
      } ${rowAction ? `justify-center ${ROW_ACTION_FLOOR}` : ""} ${
        current
          ? "text-accent-teal"
          : "text-text-muted/50 hover:text-accent-teal"
      }`}
      // A library of stars all called "Add to favorites" gives a screen
      // reader no way to tell which row it is on.
      aria-label={
        entityName
          ? t(current ? "removeFor" : "addFor", { name: entityName })
          : t(current ? "remove" : "add")
      }
    >
      <Star
        ref={iconRef}
        size={iconSize}
        fill={current ? "currentColor" : "none"}
        strokeWidth={current ? 0 : 2}
      />
      {showLabel && <span>{current ? t("added") : t("label")}</span>}
    </button>
  );
}
