"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

import { useTranslations } from "next-intl";
import { toggleFavorite } from "@/lib/api";
import type { FileItem } from "@/types";

export function FavoriteButton({
  fileId,
  isFavorite,
  onToggle,
  size = "sm",
  showLabel = false,
}: {
  fileId: string;
  isFavorite: boolean;
  onToggle: (file: FileItem) => void;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const t = useTranslations("favorite");
  const [optimistic, setOptimistic] = useState(isFavorite);
  const [pending, setPending] = useState(false);
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!pending) setOptimistic(isFavorite);
  }, [isFavorite, pending]);

  const current = pending ? optimistic : isFavorite;
  const iconSize = size === "sm" ? 16 : 18;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    setOptimistic(!current);
    setPending(true);
    if (!current && iconRef.current) {
      iconRef.current.classList.remove("animate-pop");
      void (iconRef.current as unknown as HTMLElement).offsetWidth;
      iconRef.current.classList.add("animate-pop");
    }
    try {
      const updated = await toggleFavorite(fileId);
      onToggle(updated);
    } catch {
      setOptimistic(current);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
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
      <Star
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
