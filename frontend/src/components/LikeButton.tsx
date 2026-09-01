"use client";

import { ThumbsUp } from "lucide-react";

import { useTranslations } from "next-intl";
import { useOptimisticFileToggle } from "@/hooks/useOptimisticFileToggle";
import { likeFile } from "@/lib/api";
import type { FileItem } from "@/types";

/**
 * "This was good" — a record of something already consumed, as opposed to
 * the favorite star's "open this again".
 *
 * Deliberately only on the file page. Pressing it is an act performed
 * after actually reading or watching, and that friction is what keeps the
 * two apart.
 */
export function LikeButton({
  fileId,
  likedAt,
  onToggle,
  size = "sm",
  showLabel = false,
}: {
  fileId: string;
  likedAt: string | null;
  onToggle: (file: FileItem) => void;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const t = useTranslations("like");
  const { current, iconRef, toggle } = useOptimisticFileToggle({
    value: likedAt !== null,
    mutate: () => likeFile(fileId),
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
      } ${
        current
          ? "text-accent-teal"
          : "text-text-muted/50 hover:text-accent-teal"
      }`}
      aria-label={current ? t("remove") : t("add")}
    >
      <ThumbsUp
        ref={iconRef}
        size={iconSize}
        fill={current ? "currentColor" : "none"}
        strokeWidth={current ? 0 : 2}
      />
      {showLabel && (
        <span>{current ? t("added") : t("label")}</span>
      )}
    </button>
  );
}
