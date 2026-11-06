"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useImeKeyGuard } from "@/lib/ime";
import type { FileKind, SortField, SortOrder } from "@/types";

import { ConditionMenu } from "./ConditionMenu";
import { SearchFilterChips } from "./SearchFilterChips";

interface SearchQueryHeaderProps {
  drive: string;
  query: string;
  typeFilter: FileKind | null;
  sort: SortField;
  order: SortOrder;
  smartFolderId: string | null;
  includeSceneClip: boolean;
  /** `passages` while the page shows the Passages view. */
  show?: string | null;
}

export function SearchQueryHeader({
  drive,
  query,
  typeFilter,
  sort,
  order,
  smartFolderId,
  includeSceneClip,
  show,
}: SearchQueryHeaderProps) {
  const t = useTranslations("search");
  const router = useRouter();
  const ime = useImeKeyGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(query);

  useEffect(() => {
    setText(query);
  }, [query]);

  const searchHref = (value: string): string => {
    const params = new URLSearchParams({ q: value });
    if (typeFilter) params.set("type", typeFilter);
    if (sort !== "relevance") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    if (smartFolderId) params.set("smart_folder_id", smartFolderId);
    if (includeSceneClip) params.set("include_scene_clip", "true");
    if (show === "passages") params.set("show", "passages");
    return `/drive/${encodeURIComponent(drive)}/search?${params.toString()}`;
  };

  const submit = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setText("");
      inputRef.current?.focus();
      return;
    }
    if (normalized === query.trim()) return;
    router.push(searchHref(normalized));
  };

  const removeChip = (next: string) => {
    setText(next);
    const normalized = next.trim();
    if (!normalized) {
      const params = new URLSearchParams();
      if (sort !== "relevance") {
        params.set("sort", sort);
        params.set("order", order);
      } else if (order !== "desc") {
        params.set("order", order);
      }
      const qs = params.toString();
      router.push(`/drive/${encodeURIComponent(drive)}${qs ? `?${qs}` : ""}`);
      return;
    }
    router.push(searchHref(normalized));
  };

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={text}
        aria-label={t("queryField")}
        data-role="query-field"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (ime.isImeKeystroke(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            submit(text);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(query);
          }
        }}
        className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-1.5 text-lg text-text-primary outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SearchFilterChips
          query={text}
          onRemove={(next) => removeChip(next)}
          fallbackRef={inputRef}
        />

        <ConditionMenu
          drive={drive}
          query={text}
          typeFilter={typeFilter}
          entries={["tag", "kind", "folder", "collection", "favorite"]}
          label={t("addFilterWord")}
          ariaLabel={t("addFilter")}
          onChoose={(next) => {
            setText(next);
            submit(next);
          }}
        />
      </div>
    </div>
  );
}
