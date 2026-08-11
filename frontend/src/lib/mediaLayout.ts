"use client";

/**
 * Whether the media file detail puts its companion region beside the
 * player or below it — Litloft's equivalent of a theater-mode toggle.
 *
 * The value lives on `<html>` as `data-media-layout`, set before first
 * paint by the init script in `app/layout.tsx`. The layout itself is
 * decided entirely in CSS from that attribute, so nothing here has to
 * re-render for the layout to change and there is no frame of stacked
 * layout before it shifts.
 *
 * localStorage rather than a server-side profile, matching the two
 * standing decisions on display preferences: player-adjacent settings
 * stay out of `/settings`, and a preference that legitimately differs
 * between a phone and a desktop belongs to the device.
 *
 * Spec: docs/superpowers/specs/2026-08-11-media-layout-toggle.md
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "media-layout-preference";
const ATTRIBUTE = "data-media-layout";

export type MediaLayout = "stacked" | "beside";

/** Stacked unless the stored value says otherwise. */
function normalise(value: string | null | undefined): MediaLayout {
  return value === "beside" ? "beside" : "stacked";
}

export function readMediaLayout(): MediaLayout {
  if (typeof document === "undefined") return "stacked";
  // Prefer the attribute: the init script already resolved it, and it
  // is what the CSS is actually acting on.
  const applied = document.documentElement.getAttribute(ATTRIBUTE);
  if (applied) return normalise(applied);
  try {
    return normalise(window.localStorage?.getItem?.(STORAGE_KEY));
  } catch {
    return "stacked";
  }
}

export function useMediaLayoutPreference(): [
  MediaLayout,
  (value: MediaLayout) => void,
] {
  // Starts at the default so the first client render matches the
  // server's. Only the button's icon depends on this, and the layout
  // does not, so settling a frame later is invisible.
  const [layout, setLayout] = useState<MediaLayout>("stacked");

  useEffect(() => {
    const current = readMediaLayout();
    setLayout(current);
    // Re-apply on mount. Hydration reconciles `<html>`'s attributes and
    // drops the one the init script added, which is why ThemeProvider
    // re-applies `data-theme` too. Without this the preference survives
    // in storage but stops driving the CSS after the first paint.
    document.documentElement.setAttribute(ATTRIBUTE, current);
  }, []);

  const update = useCallback((value: MediaLayout) => {
    setLayout(value);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(ATTRIBUTE, value);
    }
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, value);
    } catch {
      // localStorage unavailable (private mode, test env) — the
      // attribute still drives this session.
    }
  }, []);

  return [layout, update];
}
