"use client";

import { useId, useRef, useState } from "react";
import { Check, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind, TrustFilter } from "@/types";
import { TRUST_OPTION_KEYS, TYPE_OPTION_KEYS } from "./filterOptions";
import { useMenuSurface } from "@/components/ToolbarMenu";
import { DismissScrim } from "@/components/DismissScrim";

interface FilterMenuProps {
  typeFilter: FileKind | null;
  onTypeFilterChange: (t: FileKind | null) => void;
  /**
   * Search leaves the trust axis out: a semantic result set is ranked and
   * truncated server-side, so filtering it afterwards silently
   * under-reports rather than narrowing.
   */
  trustFilter?: TrustFilter | null;
  onTrustFilterChange?: (t: TrustFilter | null) => void;
}

export function FilterMenu({
  typeFilter,
  onTypeFilterChange,
  trustFilter,
  onTrustFilterChange,
}: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surface = useMenuSurface(open);
  const t = useTranslations("toolbar");
  const tFilter = useTranslations("filter");
  const tTrust = useTranslations("trustTier");

  const activeType = TYPE_OPTION_KEYS.find((o) => o.value === typeFilter);
  const activeTrust = TRUST_OPTION_KEYS.find(
    (o) => o.value === (trustFilter ?? null),
  );
  // The trust word is gated on the *handler*, not on the value. Without
  // that, a caller passing a trust value and no handler gets a button
  // reading "Verified only" over a menu with no verification section —
  // named after a filter it offers no way to clear.
  const showTrust = onTrustFilterChange !== undefined;
  const activeLabels = [
    // A kind outside the table falls back to itself, not to "All": naming
    // the neutral option while the listing is narrowed is the one way this
    // button can state the opposite of what is happening. Reachable from an
    // old persisted snapshot.
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
      ref={surface.wrapperRef}
      className="relative"
      // On the box, not on the menu. Opening this leaves focus on the
      // trigger, which is outside the menu — so a handler there fired only
      // for someone who had already tabbed into a row.
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        // A React `onKeyDown` is invisible to the shortcut registry, so an
        // Escape that also reaches `ShortcutsProvider` gets answered twice.
        e.stopPropagation();
        close();
      }}
    >
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        // The same separator the face uses, deliberately: WCAG 2.5.3 asks
        // that the accessible name contain the visible label, so a voice
        // user saying what they read reaches the control. A different
        // separator here would break that containment.
        aria-label={
          isFiltering ? `${t("filter")}: ${activeLabels.join(" · ")}` : undefined
        }
        // `min-h-11`, not a hit-area overhang. `gap-2` on this bar is 8px and
        // `Button`'s overhang reaches 6px each side, so two neighbours with
        // one would overlap.
        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition-colors pointer-coarse:min-h-11 ${
          isFiltering
            ? "border-bg-border bg-bg-elevated text-text-primary font-medium"
            : "border-bg-border bg-bg-card text-text-muted hover:text-text-primary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Filter size={16} className="shrink-0" />
        <span
          // Below 640 any active filter is capped: at 320px the folder bar
          // shares its row with Add and `…`, and one long axis ("Unjudged
          // only") already wraps it. From 640 to 1024 only a second axis is.
          className={`truncate ${
            activeLabels.length > 1
              ? "max-sm:max-w-16 sm:max-lg:max-w-24"
              : isFiltering
                ? "max-sm:max-w-16"
                : ""
          }`}
        >
          {isFiltering ? activeLabels.join(" · ") : t("filter")}
        </span>
      </button>
      {open && (
        <DismissScrim onDismiss={close}>
          <div
            ref={surface.panelRef}
            role="menu"
            className={surface.className}
          >
            {/* A `role="menu"` publishes only menuitem / group / separator
                children, so a bare <p> heading reaches assistive technology
                as nothing at all. */}
            <div role="group" aria-labelledby={`${headingId}-type`}>
              <p
                id={`${headingId}-type`}
                // `aria-labelledby` resolves a hidden element, so the group
                // keeps its name while the paragraph stops being announced
                // after it.
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
                {/* Outside the group, not its first child: inside one the
                    reader hears "verification group, separator" as though the
                    group itself were being divided. */}
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
                          migrated backlog is verified and unjudged. */}
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
        </DismissScrim>
      )}
    </div>
  );
}
