"use client";

/**
 * The value lives on `<html>` as `data-media-layout`, set before first
 * paint by the init script in `app/layout.tsx`, and the CSS decides the
 * layout from that attribute.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_MEDIA_LAYOUT,
  NON_DEFAULT_MEDIA_LAYOUT,
} from "./preferenceInitScript";

const STORAGE_KEY = "media-layout-preference";
const ATTRIBUTE = "data-media-layout";

export type MediaLayout = "stacked" | "beside";

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
 * Shared rather than a `useState` per caller: two independent `useState`s
 * would have the toggle showing one form while the shell drew the other.
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
  // `useSyncExternalStore` rather than state settled in an effect: the
  // effect version renders the default for one commit, so a stacked reader
  // would have the transcript mounted beside the player and then torn down
  // and rebuilt below it on the very next commit.
  const layout = useSyncExternalStore<MediaLayout>(
    subscribe,
    readMediaLayout,
    () => DEFAULT_MEDIA_LAYOUT,
  );

  useEffect(() => {
    // Hydration reconciles `<html>`'s attributes and drops the one the init
    // script added. Without this the preference survives in storage but
    // stops driving the CSS after the first paint.
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
