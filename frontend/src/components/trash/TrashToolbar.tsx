"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckSquare, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";

interface TrashToolbarProps {
  sort: SortField;
  order: SortOrder;
  typeFilter: FileType | null;
  total: number;
  selectable: boolean;
  onSortChange: (s: SortField, o: SortOrder) => void;
  onTypeFilterChange: (t: FileType | null) => void;
  onViewChange: (mode: ViewMode) => void;
  onToggleSelectable: () => void;
}

const TYPE_OPTION_KEYS: ReadonlyArray<{ value: FileType | null; labelKey: string }> = [
  { value: null, labelKey: "all" },
  { value: "video", labelKey: "video" },
  { value: "image", labelKey: "image" },
  { value: "audio", labelKey: "audio" },
  { value: "document", labelKey: "document" },
  { value: "archive", labelKey: "archiveType" },
  { value: "other", labelKey: "other" },
];

export function TrashToolbar({
  sort, order, typeFilter, total, selectable,
  onSortChange, onTypeFilterChange, onViewChange, onToggleSelectable,
}: TrashToolbarProps) {
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const typeFilterRef = useRef<HTMLDivElement>(null);

  // An empty bin has nothing to sort, nothing to lay out and nothing to
  // filter by kind — the seven pills, the sort, the view toggle and the
  // selection mode are ten controls over an empty page. The exception
  // is a bin emptied by the filter itself: the pill that produced the
  // empty result is also the way back out of it.
  const hideArrangingControls = total === 0 && typeFilter === null;

  useEffect(() => {
    if (!typeFilterOpen) return;
    function handleClick(e: MouseEvent) {
      if (typeFilterRef.current && !typeFilterRef.current.contains(e.target as Node)) {
        setTypeFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeFilterOpen]);

  return (
    <>
      {!hideArrangingControls && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1" />
          <div className="flex items-center gap-1 rounded-lg bg-bg-card p-1">
            <SortButton sort={sort} order={order} onChange={onSortChange} />
            <button
              onClick={onToggleSelectable}
              className={`rounded-lg p-2 transition-colors ${
                selectable
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              aria-label={ts("selectMode")}
            >
              <CheckSquare size={16} />
            </button>
            <ViewToggle onChange={onViewChange} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!hideArrangingControls && (
        <div ref={typeFilterRef} className="relative sm:hidden">
          <button
            onClick={() => setTypeFilterOpen((s) => !s)}
            className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors ${
              typeFilter
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            aria-label={t("fileType")}
          >
            <Filter size={16} />
          </button>
          {typeFilterOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale origin-top-left">
              {TYPE_OPTION_KEYS.map((opt) => (
                <button
                  key={opt.labelKey}
                  onClick={() => {
                    onTypeFilterChange(opt.value);
                    setTypeFilterOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    typeFilter === opt.value
                      ? "text-accent"
                      : "text-text-primary hover:bg-bg-elevated"
                  }`}
                >
                  <span className="w-4 flex-shrink-0">
                    {typeFilter === opt.value && <Check size={14} />}
                  </span>
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        {!hideArrangingControls && (
        <div className="hidden items-center gap-1 sm:flex">
          {TYPE_OPTION_KEYS.map((tab) => (
            <button
              key={tab.labelKey}
              onClick={() => onTypeFilterChange(tab.value)}
              className={`rounded-lg px-2.5 py-1 text-sm transition-colors ${
                typeFilter === tab.value
                  ? "bg-accent/20 font-medium text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        )}
        <span className="text-sm text-text-muted">{tc("items", { count: total })}</span>
      </div>
    </>
  );
}
