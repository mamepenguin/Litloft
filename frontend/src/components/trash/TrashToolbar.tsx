"use client";

import { useRef, useState } from "react";
import { Check, CheckSquare, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { ViewToggle } from "@/components/ViewToggle";
import { DismissScrim } from "@/components/DismissScrim";
import {
  ANCHORED_ORIGIN,
  ANCHORED_VERTICAL,
  useAnchoredDirection,
} from "@/hooks/useAnchoredDirection";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
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
  { value: null, labelKey: "type.all" },
  { value: "video", labelKey: "type.video" },
  { value: "image", labelKey: "type.image" },
  { value: "audio", labelKey: "type.audio" },
  { value: "document", labelKey: "type.document" },
  { value: "archive", labelKey: "type.archive" },
  { value: "other", labelKey: "type.other" },
];

export function TrashToolbar({
  sort, order, typeFilter, total, selectable,
  onSortChange, onTypeFilterChange, onViewChange, onToggleSelectable,
}: TrashToolbarProps) {
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tFilter = useTranslations("filter");
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const typeFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const typeFilterWrapperRef = useRef<HTMLDivElement>(null);
  const typeFilterMenuRef = useRef<HTMLDivElement>(null);
  const { openUp, side } = useAnchoredDirection({
    triggerRef: typeFilterWrapperRef,
    panelRef: typeFilterMenuRef,
    open: typeFilterOpen,
    gapPx: ANCHORED_VERTICAL[1].px,
    preferSide: "left",
  });

  // A bin emptied by the filter itself keeps its controls: the pill that
  // produced the empty result is also the way back out of it.
  const hideArrangingControls = total === 0 && typeFilter === null;

  // On the shortcut stack, not on `document`: a listener does not know
  // what is stacked above it.
  //
  // `editingOnly: false` because nothing traps focus inside this menu, so
  // Tab can walk out into a field, and the default would leave Escape inert
  // there with the menu still up.
  useShortcuts(
    "trash-type-filter-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          setTypeFilterOpen(false);
          typeFilterTriggerRef.current?.focus();
        },
      },
    ],
    typeFilterOpen,
    OVERLAY_PRIORITY,
  );

  return (
    <>
      {!hideArrangingControls && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1" />
          <div className="flex items-center gap-1 rounded-lg bg-bg-card p-1">
            <SortButton sort={sort} order={order} onChange={onSortChange} />
            {/* Same pill as ViewToggle, so the same idiom: selection is a
                border, not an accent fill. */}
            <button
              onClick={onToggleSelectable}
              aria-pressed={selectable}
              className={`rounded-lg border p-2 transition-colors ${
                selectable
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary"
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
        <div ref={typeFilterWrapperRef} className="relative sm:hidden">
          <button
            ref={typeFilterTriggerRef}
            onClick={() => setTypeFilterOpen((s) => !s)}
            className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors ${
              typeFilter
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            aria-haspopup="menu"
            aria-expanded={typeFilterOpen}
            aria-label={t("fileType")}
          >
            <Filter size={16} />
          </button>
          {typeFilterOpen && (
            <DismissScrim
              onDismiss={() => setTypeFilterOpen(false)}
              className="fixed inset-0 z-30"
            >
              <div
                ref={typeFilterMenuRef}
                role="menu"
                aria-label={t("fileType")}
                className={`absolute z-30 min-w-[140px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale ${
                  ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
                } ${side === "left" ? "left-0" : "right-0"} ${
                  ANCHORED_ORIGIN[`${openUp ? "up" : "down"}-${side}`]
                }`}
              >
                {TYPE_OPTION_KEYS.map((opt) => (
                  <button
                    key={opt.labelKey}
                    // The tick is the only thing saying which one is on, and
                    // it is an unlabelled glyph.
                    role="menuitemradio"
                    aria-checked={typeFilter === opt.value}
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
                    {tFilter(opt.labelKey)}
                  </button>
                ))}
              </div>
            </DismissScrim>
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
              {tFilter(tab.labelKey)}
            </button>
          ))}
        </div>
        )}
        <span className="text-sm text-text-muted">{tc("items", { count: total })}</span>
      </div>
    </>
  );
}
