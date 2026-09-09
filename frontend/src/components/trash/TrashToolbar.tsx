"use client";

import { useRef, useState } from "react";
import { Check, CheckSquare, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { ViewToggle } from "@/components/ViewToggle";
import { DismissScrim } from "@/components/DismissScrim";
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

/** Same vocabulary, same source. See FolderToolbar's note. */
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

  // An empty bin has nothing to sort, nothing to lay out and nothing to
  // filter by kind — the seven pills, the sort, the view toggle and the
  // selection mode are ten controls over an empty page. The exception
  // is a bin emptied by the filter itself: the pill that produced the
  // empty result is also the way back out of it.
  const hideArrangingControls = total === 0 && typeFilter === null;

  // A popup must be dismissable from the keyboard. Without it the only
  // ways out are a pointer on the scrim or picking a row, so a keyboard
  // user who opens this menu cannot back out of it.
  //
  // On the shortcut stack, not on `document`: a listener does not know
  // what is stacked above it, and `escape-listeners.test.ts` records the
  // presses that were answered twice before this was the rule.
  // `OVERLAY_PRIORITY` is what puts this menu ahead of the page beneath
  // while it is open. `FileActions` carries the same block and the
  // reasoning in full.
  //
  // `editingOnly: false` because nothing traps focus inside this menu, so
  // Tab walks out of the last row into whatever follows in the document.
  // The provider counts a focused field as "editing", and the default
  // fires only when nothing is — which would leave Escape inert exactly
  // there, with the menu still up. The test case for that state is what
  // makes the flag checkable.
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
                border (DESIGN.md §Selected-state controls). It was an accent
                fill, which put two different ways of saying "this one is on"
                side by side in one control cluster — and spent the screen's
                one fill on a mode toggle. */}
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
        <div className="relative sm:hidden">
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
              // No tint: anchored to its trigger, and the control itself
              // only exists below `sm`.
              className="fixed inset-0 z-30"
            >
              <div role="menu" aria-label={t("fileType")} className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale origin-top-left">
                {TYPE_OPTION_KEYS.map((opt) => (
                  <button
                    key={opt.labelKey}
                    // As `MenuRadioGroup` does for the same rows elsewhere:
                    // the tick is the only thing saying which one is on, and
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
