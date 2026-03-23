"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { VideoListPage } from "@/components/VideoListPage";

export default function CategoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = decodeURIComponent(params.slug as string);
  const isAll = slug === "all";
  const tagFilter = searchParams.get("tag");

  const label = tagFilter
    ? `#${tagFilter}`
    : isAll
      ? "すべて"
      : slug;

  const fetchParams = useMemo(
    () => ({
      category: isAll ? undefined : slug,
      tag: tagFilter || undefined,
    }),
    [isAll, slug, tagFilter],
  );

  return (
    <VideoListPage
      label={label}
      fetchParams={fetchParams}
    />
  );
}
