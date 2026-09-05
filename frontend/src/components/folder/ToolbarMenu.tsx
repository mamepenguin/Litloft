"use client";

import { useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * The scope a toolbar control keeps, and the class that enforces it.
 *
 * `md`, the same 768 the left group uses: below it the bar carries `Play`,
 * `Filter` and `…`, and `View` and `Sort` are sections of `…`. `00-basis.md`
 * calls 640-767 the mobile form with padding around it, and 案 2's
 * acceptance list asks for four exposed controls plus a conditional `Play`
 * on the desktop form — so 768 is where that form starts. (`00-basis.md`'s
 * 768-1119 "intermediate width" is 案 1's inspector, not this toolbar.)
 *
 * **Nothing wraps this bar.** Measured in Chromium at 1px over 320-1512,
 * both locales, all seven orders, with and without both filter axes: one
 * row everywhere. The one combination that used to take two — both axes
 * narrowed, ordered by title or size, and an addon drawing a button beside
 * `Add` — closed when the last addon on the superseded `folder-actions`
 * slot moved into the `Add` menu, and the slot came out with it.
 *
 * **The budget, in the locale that binds it.** At 768 the Japanese row is
 * `追加` 100 + `再生` 72 + `グリッド表示` 126 + `タイトルA→Z` 131 + the
 * capped filter 144 + `その他の操作` 44, six 8px gaps and 32px of `px-4`
 * = **697 of 768**. English is 682. So an addon putting a labelled control
 * back on this bar has **63px** to spend, not the ~118 a rounder number
 * suggests — and the standalone `AI` button that used to sit here was 81,
 * which is why it wrapped both locales.
 *
 * Stated as data as well as a class. jsdom computes no layout, and reading a
 * class list for the literal token `hidden` is not a proxy for it —
 * `max-md:hidden` hides without that token and `md:!flex` shows despite it.
 * `SelectionBar`'s `visibility()` does the same, and `toolbarBarScope` reads
 * the attribute, so this is two statements rather than one and a decoration.
 */
export const BAR_WIDE = { className: "hidden md:flex", "data-bar": "wide" } as const;

/**
 * The popover surface every menu on this bar opens.
 *
 * A bottom sheet under 640px and a menu anchored to its trigger above it.
 * Written once so the three cannot drift. `FilterMenu` takes it too: a copy
 * of a surface recipe diverges on whichever property nobody is comparing,
 * and the one that matters here is whether a row can be reached at all.
 *
 * **It is capped and scrollable at every width.** Below 768 this menu holds
 * ten rows — `View` and `Sort` are sections of `…` there rather than
 * controls on the bar — against three from 768 up (measured `scrollHeight`
 * 514 at 640 wide, 116 at 844). So the band that needs the cap is 640-767:
 * anchored to its trigger *and* ten rows deep. Below 640 the sheet form is
 * already capped at 60vh. Uncapped, an anchored ten-row menu runs past the
 * bottom of a landscape phone, and page scrolling cannot bring the rest
 * back — it is inside a `sticky` bar and travels with it.
 */
export const MENU_SURFACE =
  "fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border " +
  "border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale " +
  "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 " +
  "sm:max-h-[70vh] sm:min-w-[200px] sm:origin-top-right";

interface ToolbarMenuProps {
  /** What the control does. Prefixes the accessible name. */
  label: string;
  /** What is currently chosen. This is what the face reads. */
  value: string;
  icon: ComponentType<{ size?: number }>;
  /** Layout only — which widths this control lives at. */
  className?: string;
  "data-bar"?: "wide";
  /** Rows. Given `close` so a row can dismiss the menu it was pressed in. */
  children: (close: () => void) => ReactNode;
}

/**
 * A labelled toolbar control that opens a menu.
 *
 * The face carries a word at every state, which is the whole point of 案 2's
 * "no unlabelled icon on the bar but `…`": the two halves of the view toggle
 * and the sort button were bare glyphs, and nothing on the bar said what
 * either did until you pressed one.
 *
 * The visible word is the *state* and the accessible name is
 * `label: state`, so WCAG 2.5.3's containment holds — a voice user saying
 * what they read reaches the control — and the name is still findable by
 * someone who does not know the state. `FilterMenu` names itself the same
 * way; the difference is that filtering has an off position and neither of
 * these does, so the word is never the bare label.
 */
export function ToolbarMenu({
  label,
  value,
  icon: Icon,
  className = "",
  "data-bar": bar,
  children,
}: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={`relative ${className}`}
      data-bar={bar}
      // On the box, not on the menu: opening this leaves focus on the
      // trigger, which is outside the menu, so a handler there fires only
      // for someone who has already tabbed into a row. `FilterMenu` records
      // the measurement.
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        // `escape-listeners.test.ts` records why this stops here: a React
        // `onKeyDown` is invisible to the shortcut registry, so an Escape
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
        // `min-h-11`, not a hit-area overhang, and the reason is this bar's
        // own arithmetic rather than a rule quoted from elsewhere: `gap-2`
        // is 8px, `Button`'s overhang is `-inset-1.5` — 6px on each side, so
        // 12px between neighbours — and two of them would overlap, the later
        // one winning the hit test. DESIGN.md §Row Actions describes that
        // mechanism, but it *prescribes* the overhang and scopes its warning
        // to a shorter pitch than this, on controls repeated once per row.
        // These are one-offs on a toolbar. Growing the box is simply the
        // simpler thing here.
        className="flex items-center gap-1.5 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
      >
        <Icon size={16} />
        <span>{value}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
            aria-hidden="true"
            onClick={close}
          />
          {/* The scrim is a mouse gesture, so Escape (handled on the box
              above) is the keyboard's only way out. Arrow-key roving is the
              rest of the APG menu contract and is not here yet; the rows are
              ordinary buttons in tab order — the same gap `FilterMenu`
              records. */}
          <div role="menu" className={MENU_SURFACE}>
            {children(close)}
          </div>
        </>
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
 * One "choose exactly one of these" section of a menu.
 *
 * `role="group"` + `aria-labelledby`: a `role="menu"` publishes only
 * menuitem / group / separator children, so a bare `<p>` heading reaches
 * assistive technology as nothing at all — and these menus hold rows whose
 * words repeat across sections. `menuitemradio` with `aria-checked` is what
 * says which one is on; a tick drawn as an unlabelled `<svg>` says it only to
 * people who can see it.
 *
 * Shared because the folder toolbar draws each of these sections twice: once
 * in its own menu on the bar, and once inside `…` at the widths where that
 * control is not on the bar. Two copies would let the phone and the desktop
 * offer different orders.
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
            // A negative outline offset, because the menu now scrolls on
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

/** The line between two groups of a menu. */
export function MenuSeparator() {
  return <div className="my-1 border-t border-bg-border" role="separator" />;
}
