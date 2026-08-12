"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "video-share-captions";
const CHANGE_EVENT = "litloft:captions-preference-change";

export type CaptionsPreference = boolean | null;

export function readCaptionsPreference(): CaptionsPreference {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage?.getItem?.(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the viewer wants subtitles, remembered across files and
 * sessions — the same treatment autoplay and playback speed get.
 *
 * An unset preference stays null so each backend keeps its own default:
 * native video honors `<track default>`, while YouTube already starts
 * captions off through `cc_load_policy: 0`.
 *
 * Hydrates in an effect rather than in the initial state: reading
 * localStorage during render would make the server and client markup
 * disagree.
 */
export function useCaptionsPreference(): [
  CaptionsPreference,
  (value: boolean) => void,
] {
  const [enabled, setEnabled] = useState<CaptionsPreference>(null);

  useEffect(() => {
    setEnabled(readCaptionsPreference());
    const sync = (event: Event) => {
      setEnabled((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable (private mode, test env) — keep in-memory only
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  }, []);

  return [enabled, update];
}
