"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MediaController } from "@/lib/mediaController";

export interface MiniPlayerInputs {
  intersecting: boolean;
  paused: boolean;
  fullscreen: boolean;
  osPip: boolean;
  desktop: boolean;
}

/**
 * Pure state-machine for the floating mini player. Separated from the
 * hook so it can be unit-tested without jsdom mocks.
 *
 * A player is shown as a mini window iff:
 *   - the viewport is desktop-sized, AND
 *   - the original player is fully off-screen, AND
 *   - media is currently playing (not paused), AND
 *   - no other presentation mode is already taking the video out of
 *     the flow (fullscreen, OS PiP).
 *
 * Cast state is intentionally NOT checked here: when the user is
 * casting to a remote device, the local <video> element is typically
 * paused by the browser anyway, so the paused gate already covers it.
 */
export function shouldShowMini(inputs: MiniPlayerInputs): boolean {
  if (!inputs.desktop) return false;
  if (inputs.fullscreen) return false;
  if (inputs.osPip) return false;
  if (inputs.paused) return false;
  return !inputs.intersecting;
}

const DESKTOP_QUERY = "(min-width: 768px)";
const PAUSE_POLL_MS = 250;

interface UseMiniPlayerOpts {
  /**
   * The element whose visibility drives the mini-player decision.
   * Typically the wrapper around the player component.
   */
  containerRef: RefObject<HTMLElement | null>;
  mc: MediaController | null;
  /**
   * Optional underlying <video>/<audio> element. Used to detect OS
   * Picture-in-Picture precisely (document.pictureInPictureElement
   * is compared to this element). Pass undefined for LoftRef (iframe)
   * — OS PiP can't target iframes so the check becomes a no-op.
   */
  mediaEl?: HTMLMediaElement | null;
  /**
   * Scroll container that owns the viewport. When the player is
   * embedded in a host whose own ``overflow-y: auto`` (e.g. the
   * 2-pane right pane) handles scrolling instead of the document
   * itself, the IntersectionObserver must observe relative to that
   * container — otherwise the anchor's viewport-relative position
   * never changes when the user scrolls and ``isIntersecting``
   * never flips, so the mini player never appears.
   *
   * Pass ``null`` or omit for callers that scroll at the document
   * level (existing /files/{id} fullscreen route, where the document
   * is the scroll container).
   */
  root?: Element | null;
}

export interface UseMiniPlayerResult {
  isMini: boolean;
  /** Scroll the original player back into view, which releases the mini. */
  restore: () => void;
  /** Pause playback and hide the mini immediately. */
  closeAndStop: () => void;
}

export function useMiniPlayer({
  containerRef,
  mc,
  mediaEl,
  root,
}: UseMiniPlayerOpts): UseMiniPlayerResult {
  const [intersecting, setIntersecting] = useState(true);
  const [paused, setPaused] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [osPip, setOsPip] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const mcRef = useRef(mc);
  mcRef.current = mc;

  // IntersectionObserver on the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setIntersecting(entry.isIntersecting);
      },
      { threshold: 0, root: root ?? null },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [containerRef, root]);

  // Poll paused state via mc.isPaused(). Polling (rather than event
  // subscription) avoids asymmetry between native <video> DOM events
  // and the YouTube IFrame Player's onStateChange — both backends
  // already expose isPaused() uniformly. A 250ms cadence is imper-
  // ceptible for a UI state switch and cheap enough to ignore.
  useEffect(() => {
    if (!mc) {
      setPaused(true);
      return;
    }
    setPaused(mc.isPaused());
    const id = window.setInterval(() => {
      const current = mcRef.current;
      if (current) setPaused(current.isPaused());
    }, PAUSE_POLL_MS);
    return () => window.clearInterval(id);
  }, [mc]);

  // Fullscreen / PiP listeners.
  useEffect(() => {
    const sync = () => {
      setFullscreen(document.fullscreenElement != null);
      setOsPip(
        mediaEl != null && document.pictureInPictureElement === mediaEl,
      );
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("enterpictureinpicture", sync);
    document.addEventListener("leavepictureinpicture", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("enterpictureinpicture", sync);
      document.removeEventListener("leavepictureinpicture", sync);
    };
  }, [mediaEl]);

  // matchMedia for desktop breakpoint.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(mq.matches);
    sync();
    // Some older browsers only support addListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  // Any transition back into the viewport implicitly un-dismisses:
  // the user scrolled the player back into sight, they clearly want
  // to see it again, so next time it scrolls away mini should reappear.
  useEffect(() => {
    if (intersecting) setDismissed(false);
  }, [intersecting]);

  const isMini =
    !dismissed &&
    shouldShowMini({ intersecting, paused, fullscreen, osPip, desktop });

  const restore = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [containerRef]);

  const closeAndStop = useCallback(() => {
    mcRef.current?.pause();
    setDismissed(true);
  }, []);

  return { isMini, restore, closeAndStop };
}
