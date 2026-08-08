"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "video-share-captions";

export function readCaptionsPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem?.(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Whether the viewer wants subtitles, remembered across files and
 * sessions — the same treatment autoplay and playback speed get.
 *
 * Defaults to off. Subtitles are an opt-in, and the embed also tells
 * the player not to enable them from the viewer's YouTube account
 * (`cc_load_policy: 0`), so this preference is the only thing that
 * turns them on inside Litloft.
 *
 * Hydrates in an effect rather than in the initial state: reading
 * localStorage during render would make the server and client markup
 * disagree.
 */
export function useCaptionsPreference(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readCaptionsPreference());
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable (private mode, test env) — keep in-memory only
    }
  }, []);

  return [enabled, update];
}
