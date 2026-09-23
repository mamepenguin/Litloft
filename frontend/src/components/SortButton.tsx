"use client";

import { useRef, useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SortField, SortOrder } from "@/types";
import { isDefaultSort, sortOptionsFor, type SortOption } from "@/components/sortOptions";
import { DismissScrim } from "@/components/DismissScrim";
import { useMenuSurface } from "@/components/ToolbarMenu";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";

/**
 * Written here instead of taken from `ToolbarMenu`: a merged string would
 * carry `sm:max-h-[70vh]` and `sm:max-h-none` at once, and which of them
 * applied would be decided by the order Tailwind emits its utilities in
 * rather than by anything readable in this file.
 */
const SORT_MENU_SURFACE_BASE =
  "fixed inset-x-2 bottom-[calc(1rem+var(--resting-strip,0px))] z-40 max-h-[60vh] overflow-y-auto rounded-2xl " +
  "border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale " +
  "sm:absolute sm:inset-x-auto sm:max-h-none sm:min-w-[180px] " +
  "sm:overflow-visible";

interface SortButtonProps {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
  allowRelevance?: boolean;
}

export function SortButton({ sort, order, onChange, allowRelevance }: SortButtonProps) {
  const t = useTranslations("sort");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // On the shortcut stack, not on `document`: a listener does not know
  // what is stacked above it.
  //
  // `editingOnly: false` because nothing traps focus inside this menu, so
  // Tab walks out of the last row into whatever follows in the document.
  // The provider counts a focused field as "editing", and the default
  // fires only when nothing is — which would leave Escape inert exactly
  // there, with the menu still up.
  useShortcuts(
    "sort-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          setOpen(false);
          triggerRef.current?.focus();
        },
      },
    ],
    open,
    OVERLAY_PRIORITY,
  );

  const surface = useMenuSurface(open, "end", SORT_MENU_SURFACE_BASE);

  const sortOptions: SortOption[] = sortOptionsFor(allowRelevance);
  const isActive = !isDefaultSort(sort, order, allowRelevance);

  return (
    <div ref={surface.wrapperRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors ${
          isActive
            ? "bg-bg-card text-text-primary"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("label")}
      >
        <ArrowDownUp size={16} />
      </button>

      {open && (
        <DismissScrim onDismiss={() => setOpen(false)}>
          <div
            ref={surface.panelRef}
            role="menu"
            aria-label={t("label")}
            className={surface.className}
          >
          {sortOptions.map((opt) => {
            const selected = opt.sort === sort && opt.order === order;
            return (
              <button
                key={`${opt.sort}-${opt.order}`}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(opt.sort, opt.order);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "bg-bg-elevated text-text-primary font-medium"
                    : "text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {selected && <Check size={14} />}
                </span>
                {t(opt.labelKey)}
              </button>
            );
          })}
          </div>
        </DismissScrim>
      )}
    </div>
  );
}
