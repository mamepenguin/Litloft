"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { X, CornerUpLeft } from "lucide-react";
import { useMiniPlayer } from "@/hooks/useMiniPlayer";
import type { MediaController } from "@/lib/mediaController";

interface MiniPlayerContainerProps {
  mc: MediaController | null;
  mediaEl?: HTMLMediaElement | null;
  /**
   * Hosts whose own ``overflow-y: auto`` handles scrolling must pass their
   * scroll element here.
   */
  root?: Element | null;
  children: ReactNode;
}

/**
 * The outer anchor div never moves, so isIntersecting reflects the player's
 * REAL position; observing the moved element would make mini mode oscillate.
 *
 * Why we do NOT use createPortal to move the player element: it reloads any
 * <iframe> in the subtree, and LoftRef (YouTube IFrame Player) loses its
 * current time, player state, and API binding on reload.
 */
export function MiniPlayerContainer({
  mc,
  mediaEl,
  root,
  children,
}: MiniPlayerContainerProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("player");
  const { isMini, restore, closeAndStop } = useMiniPlayer({
    containerRef: anchorRef as RefObject<HTMLElement | null>,
    mc,
    mediaEl,
    root,
  });

  return (
    <div
      ref={anchorRef}
      aria-hidden={isMini || undefined}
      className={
        isMini ? "aspect-video w-full rounded-xl bg-bg-card" : "w-full"
      }
    >
      <div
        className={
          isMini
            ? "group/mini fixed right-4 z-40 h-[180px] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-black shadow-card ring-1 ring-bg-border"
            : "w-full"
        }
        // PWA safe-area: viewport-fit=cover means the home indicator
        // sits at the bottom of the viewport. The 16px breathing
        // strip is layered on top of the safe-area inset so the
        // mini player clears the home-bar gesture region.
        style={
          isMini
            ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }
            : undefined
        }
      >
        {children}
        {isMini && (
          <>
            {/* Both buttons top-left so they don't collide with
                existing player-owned overlays (AutoplayToggle /
                PiPToggle / CastButton live at top-right). */}
            <div className="absolute left-2 top-2 z-20 flex gap-1.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/mini:opacity-100 pointer-coarse:opacity-100">
              <button
                type="button"
                aria-label={t("miniPlayerClose")}
                onClick={closeAndStop}
                className="rounded-full bg-black/70 p-1.5 text-white hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                aria-label={t("miniPlayerRestore")}
                onClick={restore}
                className="rounded-full bg-black/70 p-1.5 text-white hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
