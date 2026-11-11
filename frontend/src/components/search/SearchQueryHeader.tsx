"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";

import { useImeKeyGuard } from "@/lib/ime";
import { classifyClipboard } from "@/lib/imageQuery";
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
  /** The picture of an image query, shown as a chip at the field's leading edge. */
  imageSrc?: string | null;
  onRemoveImage?: () => void;
  /** Opening the picker and handing over its file. */
  onImagePick?: (file: File) => void;
  /** A paste of exactly one image with no text. */
  onImagePaste?: (file: File) => void;
  /** A paste or drop that holds more than one image. */
  onImageMany?: () => void;
  onEdit?: () => void;
  imagePreparing?: boolean;
  /** Takes the URL's `type` off; the page owns the parameters it keeps. */
  onRemoveType?: () => void;
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
  imageSrc,
  onRemoveImage,
  onImagePick,
  onImagePaste,
  onImageMany,
  onEdit,
  imagePreparing,
  onRemoveType,
}: SearchQueryHeaderProps) {
  const t = useTranslations("search");
  const tFilter = useTranslations("filter");
  const router = useRouter();
  const ime = useImeKeyGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(query);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsPhone(media.matches);
    apply();
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, []);

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

  const typeLabel = typeFilter ? tFilter(`type.${typeFilter}`) : "";

  const imageButtonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary";
  const imagePillClass =
    "inline-flex min-h-11 items-center gap-1 rounded-full bg-sand px-3 py-1.5 text-sm text-text-primary";
  const spinner = (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );

  return (
    <div className="min-w-0">
      <div
        className={`relative flex min-w-0 items-center gap-2${
          imageSrc
            ? " rounded-2xl border border-warm-silver/40 bg-bg-card px-2 py-1"
            : ""
        }`}
      >
        {imageSrc && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-sand py-1 pl-1 pr-1.5">
            <img src={imageSrc} alt="" className="h-7 w-7 rounded-lg object-cover" />
            <span className="text-xs font-semibold text-text-primary">{t("image")}</span>
            <button
              type="button"
              aria-label={t("removeImage")}
              onClick={onRemoveImage}
              className="rounded-full p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={text}
          aria-label={t("queryField")}
          data-role="query-field"
          onChange={(e) => {
            setText(e.target.value);
            onEdit?.();
          }}
          onPaste={(e) => {
            if (!onImagePaste) return;
            const pasted = classifyClipboard(e.clipboardData);
            if (pasted.kind === "one") {
              e.preventDefault();
              onImagePaste(pasted.file);
            } else if (pasted.kind === "several") {
              e.preventDefault();
              onImageMany?.();
            }
          }}
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
          className={
            imageSrc
              ? "min-w-0 flex-1 bg-transparent px-1 py-1.5 text-lg text-text-primary outline-none"
              : `w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-1.5 text-lg text-text-primary outline-none focus:ring-2 focus:ring-[var(--focus-ring)]${onImagePick && !isPhone ? " pr-10" : ""}`
          }
        />
        {onImagePick && !isPhone && (
          <button
            type="button"
            aria-label={t("searchByImage")}
            aria-busy={imagePreparing ? "true" : undefined}
            onClick={() => pickerRef.current?.click()}
            className={
              imageSrc
                ? imageButtonClass
                : `${imageButtonClass} absolute right-1 top-1/2 -translate-y-1/2`
            }
          >
            {imagePreparing ? spinner : <ImagePlus size={16} />}
          </button>
        )}
      </div>

      {imageSrc && onImagePick && isPhone && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={t("searchByImage")}
            aria-busy={imagePreparing ? "true" : undefined}
            onClick={() => pickerRef.current?.click()}
            className={imagePillClass}
          >
            {imagePreparing ? spinner : <ImagePlus size={16} />}
            {t("searchByImage")}
          </button>
        </div>
      )}

      {!imageSrc && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onImagePick && isPhone && (
            <button
              type="button"
              aria-label={t("searchByImage")}
              aria-busy={imagePreparing ? "true" : undefined}
              onClick={() => pickerRef.current?.click()}
              className={imagePillClass}
            >
              {imagePreparing ? spinner : <ImagePlus size={16} />}
              {t("searchByImage")}
            </button>
          )}
          {typeFilter && (
            <span
              title={typeLabel}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sand py-0.5 pl-2 pr-1 text-xs text-text-primary"
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                <span className="font-semibold">{t("filterKind")}</span> {typeLabel}
              </span>
              <button
                type="button"
                aria-label={t("removeFilter", {
                  label: t("filterKind"),
                  value: typeLabel,
                })}
                onClick={onRemoveType}
                className="shrink-0 rounded-full p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                ×
              </button>
            </span>
          )}

          <SearchFilterChips
            query={text}
            onRemove={(next) => removeChip(next)}
            fallbackRef={inputRef}
          />

          <ConditionMenu
            drive={drive}
            query={text}
            typeFilter={typeFilter}
            entries={[
              "tag",
              "kind",
              "folder",
              "collection",
              "size",
              "duration",
              "favorite",
            ]}
            label={t("addFilterWord")}
            ariaLabel={t("addFilter")}
            onChoose={(next) => {
              setText(next);
              submit(next);
            }}
          />
        </div>
      )}

      {onImagePick && (
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImagePick(file);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}
