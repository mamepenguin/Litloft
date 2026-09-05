"use client";

import { useState } from "react";
import { Check, Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind, TrustFilter } from "@/types";
import { TRUST_OPTION_KEYS, TYPE_OPTION_KEYS } from "./filterOptions";

interface FilterMenuProps {
  typeFilter: FileKind | null;
  onTypeFilterChange: (t: FileKind | null) => void;
  /**
   * The trust axis is optional. Archive listings and other non-drive
   * surfaces wire no handler, and the section is absent there rather
   * than present and dead.
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
  const activeLabels = [
    typeFilter !== null ? tFilter(activeType?.labelKey ?? "type.all") : null,
    trustFilter ? tTrust(activeTrust?.labelKey ?? "filterAll") : null,
  ].filter(Boolean) as string[];
  const isFiltering = activeLabels.length > 0;

  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition-colors ${
          isFiltering
            ? "border-bg-border bg-bg-elevated text-text-primary font-medium"
            : "border-bg-border bg-bg-card text-text-muted hover:text-text-primary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Filter size={16} />
        {/* Always a word, filtering or not. The two chips this replaces were
            bare icons until something was selected. */}
        <span>{isFiltering ? activeLabels.join(" · ") : t("filter")}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
            aria-hidden="true"
            onClick={close}
          />
          <div
            role="menu"
            className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-[70vh] sm:min-w-[200px] sm:origin-top-right"
          >
            <p className="px-3 py-1.5 text-xs font-semibold text-text-muted">
              {t("fileType")}
            </p>
            {TYPE_OPTION_KEYS.map((opt) => (
              <button
                key={opt.labelKey}
                role="menuitem"
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

            {onTrustFilterChange && (
              <>
                <div className="my-1 border-t border-bg-border" />
                <p className="px-3 py-1.5 text-xs font-semibold text-text-muted">
                  {tTrust("filterLabel")}
                </p>
                {TRUST_OPTION_KEYS.map((opt) => (
                  <button
                    key={opt.labelKey}
                    role="menuitem"
                    onClick={() => {
                      onTrustFilterChange(opt.value);
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
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
