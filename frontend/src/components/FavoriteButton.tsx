"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

import { toggleFavorite } from "@/lib/api";
import type { Video } from "@/types";

export function FavoriteButton({
  videoId,
  isFavorite,
  onToggle,
  size = "sm",
  showLabel = false,
}: {
  videoId: number;
  isFavorite: boolean;
  onToggle: (video: Video) => void;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const [optimistic, setOptimistic] = useState(isFavorite);
  const [pending, setPending] = useState(false);

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
    try {
      const updated = await toggleFavorite(videoId);
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
          ? "text-yellow-400"
          : "text-text-muted/50 hover:text-yellow-400"
      }`}
      aria-label={current ? "お気に入り解除" : "お気に入りに追加"}
    >
      <Star
        size={iconSize}
        fill={current ? "currentColor" : "none"}
        strokeWidth={current ? 0 : 2}
      />
      {showLabel && (
        <span>{current ? "お気に入り済み" : "お気に入り"}</span>
      )}
    </button>
  );
}
