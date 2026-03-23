"use client";

import { useCallback, useMemo } from "react";

import type { Video } from "@/types";
import { VideoListPage } from "@/components/VideoListPage";

const removeFavoriteToggle = (videos: Video[], updated: Video): Video[] =>
  updated.is_favorite
    ? videos.map((v) => (v.id === updated.id ? updated : v))
    : videos.filter((v) => v.id !== updated.id);

export default function FavoritesPage() {
  const fetchParams = useMemo(() => ({ favorite: true as const }), []);
  const onFavoriteToggle = useCallback(removeFavoriteToggle, []);

  return (
    <VideoListPage
      label="お気に入り"
      searchPlaceholder="お気に入りを検索..."
      emptyVariant="no-favorites"
      fetchParams={fetchParams}
      onFavoriteToggle={onFavoriteToggle}
    />
  );
}
