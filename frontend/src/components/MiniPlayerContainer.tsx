"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { X, CornerUpLeft } from "lucide-react";
import { useMiniPlayer } from "@/hooks/useMiniPlayer";
import type { MediaController } from "@/lib/mediaController";

interface MiniPlayerContainerProps {
  mc: MediaController | null;
  /**
   * Underlying native media element, if any. Enables precise OS PiP
   * detection (document.pictureInPictureElement comparison). LoftRef
   * callers pass null/undefined.
   */
  mediaEl?: HTMLMediaElement | null;
  children: ReactNode;
}

/**
 * Wraps a player so that once it scrolls out of view on desktop, it
 * reflows into a fixed-position 320x180 mini window at the bottom
 * right of the viewport. When mini is active, the outer anchor div
 * keeps the player's original layout space (placeholder) while the
 * inner div moves to a fixed position.
 *
 * Structure:
 *   - outer div (anchorRef): always at the natural scroll position.
 *     The IntersectionObserver watches this; it never moves, so
 *     isIntersecting reflects the player's REAL position rather than
 *     the mini window's position. Without this separation, mini mode
 *     would oscillate: moving the observed element to bottom-right
 *     would immediately flip isIntersecting back to true.
 *   - inner div: swaps between in-flow and position:fixed based on
 *     isMini. Children (native <video> / YouTube iframe) remain
 *     mounted across the switch — no remount, no reload.
 *
 * Why we do NOT use createPortal to move the player element:
 * React Portal mounts children under a different parent via
 * appendChild, which reloads any <iframe> in the subtree (browser
 * spec, not a React bug). LoftRef (YouTube IFrame Player) loses its
 * current time, player state, and API binding on reload. By instead
 * applying position:fixed to the existing wrapper, the element stays
 * in the React tree and the DOM, so both <video> currentTime and
 * YouTube IFrame state survive the transition.
 */
export function MiniPlayerContainer({
  mc,
  mediaEl,
  children,
}: MiniPlayerContainerProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("player");
  const { isMini, restore, closeAndStop } = useMiniPlayer({
    containerRef: anchorRef as RefObject<HTMLElement | null>,
    mc,
    mediaEl,
  });

  return (
    <div
      ref={anchorRef}
      aria-hidden={isMini || undefined}
      className={
        // Placeholder styling: reserve the original 16:9 slot so the
        // page below doesn't jump up when the player lifts out.
        isMini ? "aspect-video w-full rounded-xl bg-bg-card" : "w-full"
      }
    >
      <div
        className={
          isMini
            ? "group/mini fixed bottom-4 right-4 z-40 h-[180px] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-black/20"
            : "w-full"
        }
      >
        {children}
        {isMini && (
          <>
            {/* Both buttons top-left so they don't collide with
                existing player-owned overlays (AutoplayToggle /
                PiPToggle / CastButton live at top-right). */}
            <div className="absolute left-2 top-2 z-20 flex gap-1.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/mini:opacity-100">
              <button
                type="button"
                aria-label={t("miniPlayerClose")}
                title={t("miniPlayerClose")}
                onClick={closeAndStop}
                className="rounded-full bg-black/70 p-1.5 text-white hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                aria-label={t("miniPlayerRestore")}
                title={t("miniPlayerRestore")}
                onClick={restore}
                className="rounded-full bg-black/70 p-1.5 text-white hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <CornerUpLeft size={14} />
              </button>
            </div>
            <span className="sr-only" role="status" aria-live="polite">
              {t("miniPlayerAnnounced")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
