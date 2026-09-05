"use client";

import { useId, useRef, useState } from "react";
import { Check, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind, TrustFilter } from "@/types";
import { TRUST_OPTION_KEYS, TYPE_OPTION_KEYS } from "./filterOptions";

interface FilterMenuProps {
  typeFilter: FileKind | null;
  onTypeFilterChange: (t: FileKind | null) => void;
  /**
   * The trust axis is optional, and **search** is the one surface that
   * leaves it out — `FolderBrowser` passes no handler when `isSearch`,
   * because a semantic result set is ranked and truncated server-side, so
   * filtering it afterwards silently under-reports rather than narrowing.
   * (An earlier draft of this sentence said "archive listings and other
   * non-drive surfaces", copied from a comment on the chip this replaces.
   * `ArchiveToolbar` imports neither this nor `FolderToolbar`; it has its
   * own `<select>`. The reason was never checked before being repeated
   * into a commit message and a PR body.)
   */
  trustFilter?: TrustFilter | null;
  onTrustFilterChange?: (t: TrustFilter | null) => void;
}

/**
 * The folder toolbar's one way in to narrowing a listing.
 *
 * It was two chips, side by side, each an unlabelled icon that only grew a
 * word once it was already filtering — so before you used them there was
 * nothing on the bar saying what either one did. 案 2's target for this
 * toolbar is "no unlabelled icon but `…`", and two of them lived here.
 *
 * One control, one word, and the axes are headings inside it. Both stay
 * reachable in one press, which is what keeps this a consolidation of
 * *display* rather than a removal of function.
 */
export function FilterMenu({
  typeFilter,
  onTypeFilterChange,
  trustFilter,
  onTrustFilterChange,
}: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("toolbar");
  const tFilter = useTranslations("filter");
  const tTrust = useTranslations("trustTier");

  const activeType = TYPE_OPTION_KEYS.find((o) => o.value === typeFilter);
  const activeTrust = TRUST_OPTION_KEYS.find(
    (o) => o.value === (trustFilter ?? null),
  );
  // The words for what is on, in the order the sections appear. Both, when
  // both are set: a button that named only the first would be lying about
  // why the listing is short.
  //
  // The trust word is gated on the *handler*, not on the value. Without
  // that, a caller passing a trust value and no handler gets a button
  // reading "Verified only" over a menu with no verification section —
  // named after a filter it offers no way to clear.
  const showTrust = onTrustFilterChange !== undefined;
  const activeLabels = [
    // A kind outside the table falls back to itself, not to "All": naming
    // the neutral option while the listing is narrowed is the one way this
    // button can state the opposite of what is happening. Unreachable from a
    // URL (`search/page.tsx` validates against the same table), reachable
    // from an old persisted snapshot.
    typeFilter !== null
      ? activeType
        ? tFilter(activeType.labelKey)
        : typeFilter
      : null,
    showTrust && trustFilter ? tTrust(activeTrust?.labelKey ?? "filterAll") : null,
  ].filter(Boolean) as string[];
  const isFiltering = activeLabels.length > 0;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className="relative"
      // On the box, not on the menu. Opening this leaves focus on the
      // trigger, which is outside the menu — so a handler there fired only
      // for someone who had already tabbed into a row. Measured: Escape
      // after a mouse click, after Enter and after Space all left it open,
      // and the test that said otherwise dispatched the event on the menu
      // element directly, which is the one path a reader never takes.
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        // Kept from the document: `escape-listeners.test.ts` records that a
        // React `onKeyDown` is invisible to the shortcut registry, so an
        // Escape that also reaches `ShortcutsProvider` gets answered twice.
        e.stopPropagation();
        close();
      }}
    >
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        // The name always begins with the word, and carries the values
        // after it. Without the prefix this control answers to "Audio"
        // while the tree pane's own kind filter answers to "Filter by
        // type" — the broader word taken by the narrower thing, on one
        // screen. It also makes the name findable without knowing the
        // state.
        // The same separator the face uses, deliberately: WCAG 2.5.3 asks
        // that the accessible name contain the visible label, so a voice
        // user saying what they read reaches the control. A different
        // separator here would break that containment.
        aria-label={
          isFiltering ? `${t("filter")}: ${activeLabels.join(" · ")}` : undefined
        }
        // `min-h-11`, not a hit-area overhang. `gap-2` on this bar is 8px and
        // `Button`'s overhang reaches 6px each side, so two neighbours with
        // one would overlap. DESIGN.md §Row Actions describes that mechanism
        // but prescribes the overhang for controls repeated once per row, at
        // a shorter pitch than this; the box is the simpler control here.
        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition-colors pointer-coarse:min-h-11 ${
          isFiltering
            ? "border-bg-border bg-bg-elevated text-text-primary font-medium"
            : "border-bg-border bg-bg-card text-text-muted hover:text-text-primary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Filter size={16} className="shrink-0" />
        {/* Always a word, filtering or not. The two chips this replaces were
            bare icons until something was selected.
            Capped and elided below 640px, never below the word itself. With
            both axes on, the face reads `Markdown · Verified only` — 211px
            of a 343px bar, which wrapped `…` onto a second row at 375 in
            both locales. `00-basis.md` allows eliding text at that width and
            forbids the wrap, and the whole list stays in the accessible name
            above. */}
        <span
          // Capped only when more than one axis is on, and only below
          // 1024px. Two axes join with ` · ` and reach 211px, which wraps
          // this bar at 375 on its own and at 768-848 once an addon holds
          // the `folder-actions` slot — which the intelligence addon still
          // does. One axis reaches 95px against what would be a 96px cap,
          // so capping unconditionally would start eliding a single-axis
          // face on the first label that grew by two characters.
          className={`truncate ${activeLabels.length > 1 ? "max-lg:max-w-24" : ""}`}
        >
          {isFiltering ? activeLabels.join(" · ") : t("filter")}
        </span>
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
              ordinary buttons in tab order. */}
          <div
            role="menu"
            className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-[70vh] sm:min-w-[200px] sm:origin-top-right"
          >
            {/* `role="group"` + `aria-labelledby`: a `role="menu"` publishes
                only menuitem / group / separator children, so a bare <p>
                heading reaches assistive technology as nothing at all — and
                this menu holds two rows both named "All". `menuitemradio`
                with `aria-checked` is what says which one is on; a tick
                drawn as an unlabelled <svg> says it only to people who can
                see it. */}
            <div role="group" aria-labelledby={`${headingId}-type`}>
              <p
                id={`${headingId}-type`}
                // Named by, not read twice: `aria-labelledby` resolves a
                // hidden element, so the group keeps its name while the
                // paragraph stops being announced after it.
                aria-hidden="true"
                className="px-3 py-1.5 text-xs font-semibold text-text-muted"
              >
                {t("fileType")}
              </p>
            {TYPE_OPTION_KEYS.map((opt) => (
              <button
                key={opt.labelKey}
                role="menuitemradio"
                aria-checked={typeFilter === opt.value}
                onClick={() => {
                  onTypeFilterChange(opt.value);
                  close();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  typeFilter === opt.value
                    ? "bg-bg-elevated text-text-primary font-medium"
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

            {showTrust && (
              <>
                {/* Outside the group, not its first child. It separates the
                    two groups, and inside one the reader hears "verification
                    group, separator" as though the group itself were being
                    divided. */}
                <div className="my-1 border-t border-bg-border" role="separator" />
                <div role="group" aria-labelledby={`${headingId}-trust`}>
                <p
                  id={`${headingId}-trust`}
                  aria-hidden="true"
                  className="px-3 py-1.5 text-xs font-semibold text-text-muted"
                >
                  {tTrust("filterLabel")}
                </p>
                {TRUST_OPTION_KEYS.map((opt) => (
                  <button
                    key={opt.labelKey}
                    role="menuitemradio"
                    aria-checked={(trustFilter ?? null) === opt.value}
                    onClick={() => {
                      onTrustFilterChange!(opt.value);
                      close();
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      (trustFilter ?? null) === opt.value
                        ? "bg-bg-elevated text-text-primary font-medium"
                        : "text-text-primary hover:bg-bg-elevated"
                    }`}
                  >
                    <span className="mt-0.5 w-4 flex-shrink-0">
                      {(trustFilter ?? null) === opt.value && <Check size={14} />}
                    </span>
                    <span className="flex-1">
                      {tTrust(opt.labelKey)}
                      {/* "Unjudged" is not a tier — it selects files nobody
                          has ruled on, which spans both tiers because the
                          migrated backlog is verified and unjudged. The word
                          alone reads as a third state, so it says what it
                          means here. */}
                      {opt.value === "unreviewed" && (
                        <span className="mt-0.5 block text-xs font-normal text-text-muted">
                          {tTrust("filterUnreviewedHint")}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
