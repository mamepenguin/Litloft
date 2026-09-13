"use client";

import { useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Check } from "lucide-react";

import { DismissScrim } from "@/components/DismissScrim";
import { useAnchoredDirection } from "@/hooks/useAnchoredDirection";

/**
 * Stated as data as well as a class. jsdom computes no layout, and reading a
 * class list for the literal token `hidden` is not a proxy for it —
 * `max-md:hidden` hides without that token and `md:!flex` shows despite it.
 */
export const BAR_WIDE = { className: "hidden md:flex", "data-bar": "wide" } as const;

export type BarScope = "wide" | "roomy";

/**
 * It is capped and scrollable at every width. Uncapped, an anchored ten-row menu runs past the
 * bottom of a landscape phone, and page scrolling cannot bring the rest
 * back — it is inside a `sticky` bar and travels with it.
 */
const MENU_SURFACE_BASE =
  "fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border " +
  "border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale " +
  "sm:absolute sm:inset-x-auto sm:max-h-[70vh] sm:min-w-[200px]";

/**
 * `bottom-auto` / `bottom-full` are what cancel the
 * sheet's own `bottom-4` above the breakpoint.
 */
const MENU_DIRECTION = {
  down: " sm:bottom-auto sm:top-full sm:mt-1",
  up: " sm:top-auto sm:bottom-full sm:mb-1",
} as const;

/** The `sm:mt-1` / `sm:mb-1` above, in pixels. */
export const MENU_SURFACE_GAP_PX = 4;

const MENU_ALIGN = {
  right: " sm:right-0",
  left: " sm:left-0",
} as const;

const MENU_ORIGIN = {
  "down-right": " sm:origin-top-right",
  "down-left": " sm:origin-top-left",
  "up-right": " sm:origin-bottom-right",
  "up-left": " sm:origin-bottom-left",
} as const;

const PREFERRED_SIDE = { end: "right", start: "left" } as const;

/**
 * Both refs are the hook's because the decision needs both boxes, and a caller
 * that wired only one would measure the panel against itself.
 */
export function useMenuSurface(
  open: boolean,
  align: keyof typeof PREFERRED_SIDE = "end",
  /**
   * Overridable because `SortButton` is uncapped and visible-overflow above `sm`, and merging
   * its three utilities into this string would put two `max-height`
   * declarations on one element and leave the winner to the order Tailwind
   * happens to emit them in.
   */
  base: string = MENU_SURFACE_BASE,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { openUp, side } = useAnchoredDirection({
    triggerRef: wrapperRef,
    panelRef,
    open,
    gapPx: MENU_SURFACE_GAP_PX,
    preferSide: PREFERRED_SIDE[align],
  });
  return {
    wrapperRef,
    panelRef,
    className:
      base +
      MENU_DIRECTION[openUp ? "up" : "down"] +
      MENU_ALIGN[side] +
      MENU_ORIGIN[`${openUp ? "up" : "down"}-${side}`],
  };
}

interface ToolbarMenuProps {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number }>;
  className?: string;
  "data-bar"?: BarScope;
  align?: keyof typeof PREFERRED_SIDE;
  children: (close: () => void) => ReactNode;
}

/**
 * The visible word is the *state* and the accessible name is
 * `label: state`, so WCAG 2.5.3's containment holds.
 */
export function ToolbarMenu({
  label,
  value,
  icon: Icon,
  className = "",
  "data-bar": bar,
  align = "end",
  children,
}: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surface = useMenuSurface(open, align);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={surface.wrapperRef}
      className={`relative ${className}`}
      data-bar={bar}
      // On the box, not on the menu: opening this leaves focus on the
      // trigger, which is outside the menu, so a handler there fires only
      // for someone who has already tabbed into a row.
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        // A React `onKeyDown` is invisible to the shortcut registry, so an Escape
        // that also reaches `ShortcutsProvider` gets answered twice.
        e.stopPropagation();
        close();
      }}
    >
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        // `label: state`, except where the state *is* the label. A sort
        // order outside the offered table falls back to naming the control,
        // and "Sort: Sort" is a name that says one thing twice.
        aria-label={value === label ? label : `${label}: ${value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // `min-h-11`, not a hit-area overhang:
        // `gap-2` is 8px, `Button`'s overhang is `-inset-1.5` — 6px on each side, so
        // 12px between neighbours — and two of them would overlap, the later
        // one winning the hit test.
        className="flex items-center gap-1.5 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
      >
        <Icon size={16} />
        <span>{value}</span>
      </button>
      {open && (
        <DismissScrim onDismiss={close}>
          <div ref={surface.panelRef} role="menu" className={surface.className}>
            {children(close)}
          </div>
        </DismissScrim>
      )}
    </div>
  );
}

export interface MenuRadioOption<T> {
  value: T;
  label: string;
}

interface MenuRadioGroupProps<T> {
  heading: string;
  options: ReadonlyArray<MenuRadioOption<T>>;
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
}

/**
 * `role="group"` + `aria-labelledby`: a `role="menu"` publishes only
 * menuitem / group / separator children, so a bare `<p>` heading reaches
 * assistive technology as nothing at all.
 */
export function MenuRadioGroup<T>({
  heading,
  options,
  isSelected,
  onSelect,
}: MenuRadioGroupProps<T>) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <p
        id={headingId}
        // Named by, not read twice: `aria-labelledby` resolves a hidden
        // element, so the group keeps its name while the paragraph stops
        // being announced after it.
        aria-hidden="true"
        className="px-3 py-1.5 text-xs font-semibold text-text-muted"
      >
        {heading}
      </p>
      {options.map((opt) => {
        const selected = isSelected(opt.value);
        return (
          <button
            key={opt.label}
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onSelect(opt.value)}
            // A negative outline offset, because the menu scrolls on
            // both axes: CSS resolves `overflow-x` to `auto` once the other
            // axis is not `visible`, and the focus ring on a full-width row
            // was being clipped at the padding edges. Drawn inside the row
            // instead of around it.
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:-outline-offset-2 ${
              selected
                ? "bg-bg-elevated font-medium text-text-primary"
                : "text-text-primary hover:bg-bg-elevated"
            }`}
          >
            <span className="w-4 flex-shrink-0">
              {selected && <Check size={14} />}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-bg-border" role="separator" />;
}
