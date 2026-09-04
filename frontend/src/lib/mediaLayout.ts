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

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_MEDIA_LAYOUT,
  NON_DEFAULT_MEDIA_LAYOUT,
} from "./preferenceInitScript";

const STORAGE_KEY = "media-layout-preference";
const ATTRIBUTE = "data-media-layout";

export type MediaLayout = "stacked" | "beside";

/**
 * Beside unless the stored value says otherwise.
 *
 * It was stacked until 2026-09. The redesign's confirmed shape puts the
 * transcript and chapters in the inspector's tab strip, and that strip
 * exists only in the beside form — so leaving the default at stacked
 * meant the arrangement the design settled on was seen only by people
 * who found the toggle. A stored preference still wins, so nobody who
 * has chosen is moved.
 */
function normalise(value: string | null | undefined): MediaLayout {
  return value === NON_DEFAULT_MEDIA_LAYOUT
    ? NON_DEFAULT_MEDIA_LAYOUT
    : DEFAULT_MEDIA_LAYOUT;
}

export function readMediaLayout(): MediaLayout {
  if (typeof document === "undefined") return DEFAULT_MEDIA_LAYOUT;
  // Prefer the attribute: the init script already resolved it, and it
  // is what the CSS is actually acting on.
  const applied = document.documentElement.getAttribute(ATTRIBUTE);
  if (applied) return normalise(applied);
  try {
    return normalise(window.localStorage?.getItem?.(STORAGE_KEY));
  } catch {
    return DEFAULT_MEDIA_LAYOUT;
  }
}

/**
 * Everyone currently reading the preference.
 *
 * It was a plain `useState` per caller while the toggle was the only
 * one: the layout itself is decided in CSS from the attribute, so no
 * other component had to know. It does now — the file detail shell
 * moves the transcript between an inspector tab and the canvas, which
 * is a React decision, not a CSS one — and two independent `useState`s
 * would have the toggle showing one form while the shell drew the
 * other.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMediaLayoutPreference(): [
  MediaLayout,
  (value: MediaLayout) => void,
] {
  // `useSyncExternalStore` rather than state settled in an effect. The
  // effect version rendered the default for one commit, which was
  // invisible while only the button's icon depended on it and is not
  // any more: the shell moves the transcript between an inspector tab
  // and the canvas, so a stacked reader would have had it mounted
  // beside the player and then torn down and rebuilt below it on the
  // very next commit. The server snapshot keeps hydration honest — the
  // markup the server produced is the default, and React re-reads once
  // it is live.
  const layout = useSyncExternalStore<MediaLayout>(
    subscribe,
    readMediaLayout,
    () => DEFAULT_MEDIA_LAYOUT,
  );

  useEffect(() => {
    // Re-apply on mount. Hydration reconciles `<html>`'s attributes and
    // drops the one the init script added, which is why ThemeProvider
    // re-applies `data-theme` too. Without this the preference survives
    // in storage but stops driving the CSS after the first paint.
    document.documentElement.setAttribute(ATTRIBUTE, readMediaLayout());
  }, []);

  const update = useCallback((value: MediaLayout) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(ATTRIBUTE, value);
    }
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, value);
    } catch {
      // localStorage unavailable (private mode, test env) — the
      // attribute still drives this session.
    }
    // The attribute is written first, so every subscriber re-reads the
    // same value from the same place and none can hold a copy that
    // disagrees with what the CSS is acting on.
    for (const listener of listeners) listener();
  }, []);

  return [layout, update];
}
