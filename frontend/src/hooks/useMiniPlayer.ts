"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MediaController } from "@/lib/mediaController";
import { useMediaClock } from "@/lib/mediaClock";

export interface MiniPlayerInputs {
  intersecting: boolean;
  paused: boolean;
  fullscreen: boolean;
  osPip: boolean;
  desktop: boolean;
}

/**
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

interface UseMiniPlayerOpts {
  containerRef: RefObject<HTMLElement | null>;
  mc: MediaController | null;
  mediaEl?: HTMLMediaElement | null;
  /**
   * When the player is embedded in a host whose own ``overflow-y: auto``
   * handles scrolling instead of the document itself, the
   * IntersectionObserver must observe relative to that container —
   * otherwise ``isIntersecting`` never flips, so the mini player never
   * appears.
   */
  root?: Element | null;
}

export interface UseMiniPlayerResult {
  isMini: boolean;
  restore: () => void;
  closeAndStop: () => void;
}

export function useMiniPlayer({
  containerRef,
  mc,
  mediaEl,
  root,
}: UseMiniPlayerOpts): UseMiniPlayerResult {
  const [intersecting, setIntersecting] = useState(true);
  // Polling (rather than event subscription) avoids asymmetry between
  // native <video> DOM events and the YouTube IFrame Player's
  // onStateChange. A null controller reports paused, which is the right
  // default: there is nothing to float.
  const { paused } = useMediaClock(mc);
  const [fullscreen, setFullscreen] = useState(false);
  const [osPip, setOsPip] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const mcRef = useRef(mc);
  mcRef.current = mc;

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
