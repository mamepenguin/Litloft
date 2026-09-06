"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFileNavState } from "@/lib/fileNavContext";

/**
 * Prev / `n / N` / next, in the page row.
 *
 * The arrow keys have always walked to the neighbouring file; this is
 * the same walk with a handle on it. Both go through the host's
 * `onNavigate`, so the dirty-editor confirm fires either way — a second
 * path into "go to the next file" is how one of them ends up skipping
 * `navigationGuard`.
 *
 * Drawn for images only. The keys are bound for archives, PDFs and text
 * too, but those are surfaces for reading *into* a file, and a pair of
 * arrows in the page row there reads as the viewer's own paging.
 *
 * The ends are disabled rather than hidden: a control that vanishes
 * says nothing about why, and "you are at the end of the folder" is
 * exactly what the reader is asking when they press it.
 */
export function FileNavControls() {
  const t = useTranslations("file");
  const nav = useFileNavState();
  if (!nav) return null;

  const { prevId, nextId, position, total, navigatePrev, navigateNext } = nav;

  const button =
    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg " +
    "text-text-muted transition-colors hover:bg-bg-elevated " +
    "hover:text-text-primary disabled:opacity-40 " +
    "disabled:hover:bg-transparent disabled:hover:text-text-muted " +
    // The tap target is the button, not a wrapper around it: a padded
    // parent leaves the 44px on an element that does not respond to the
    // press.
    "pointer-coarse:h-11 pointer-coarse:w-11";

  return (
    <div
      data-testid="file-nav-controls"
      className="flex flex-shrink-0 items-center gap-0.5"
    >
      <button
        type="button"
        onClick={navigatePrev}
        disabled={!prevId}
        aria-label={t("prevFile")}
        title={t("prevFile")}
        data-testid="file-nav-prev"
        className={button}
      >
        <ChevronLeft size={16} />
      </button>

      {/* The readout is what goes when the row runs out of width: the
          buttons still move, and `00-basis.md` forbids wrapping a row of
          controls. It is also dropped when the ordering cannot rank this
          file — `/neighbors` reports null for both halves there, and
          half a fraction is not a smaller readout, it is a wrong one. */}
      {position !== null && total !== null && (
        <span
          data-testid="file-nav-position"
          className="hidden px-1 text-sm tabular-nums text-text-muted sm:inline"
        >
          {t("positionOf", { position, total })}
        </span>
      )}

      <button
        type="button"
        onClick={navigateNext}
        disabled={!nextId}
        aria-label={t("nextFile")}
        title={t("nextFile")}
        data-testid="file-nav-next"
        className={button}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
