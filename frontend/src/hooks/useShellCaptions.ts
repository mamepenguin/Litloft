"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useCaptionsPreference } from "@/components/player/MediaControls/hooks/useCaptionsPreference";
import { getSubtitleUrl } from "@/lib/api";
import type { CaptionsState } from "@/lib/mediaController";
import { parseVtt, type Cue } from "@/lib/vtt";
import type { SubtitleInfo } from "@/types";

export interface CaptionTrack {
  key: string;
  label: string;
  url: string;
}

export interface ShellCaptions {
  tracks: CaptionTrack[];
  /** -1 while captions are off. */
  selected: number;
  cues: Cue[];
  select: (index: number) => void;
  /** For the controller: what the captions toggle shows and does. */
  get: () => CaptionsState;
  set: (enabled: boolean) => void;
}

/**
 * Captions for a video the page does not play itself, so the browser's text
 * tracks are not there to lean on. Matches what `<track default>` does in a
 * browser: the first track shows unless the viewer turned captions off.
 */
export function useShellCaptions(videoId: string, subtitles: readonly SubtitleInfo[]): ShellCaptions {
  const t = useTranslations("player");
  const [preferred, setPreferred] = useCaptionsPreference();

  const tracks: CaptionTrack[] =
    subtitles.length > 0
      ? subtitles.map((subtitle) => ({
          key: String(subtitle.index),
          label: subtitle.label || subtitle.language || t("subtitleDefault"),
          url: getSubtitleUrl(videoId, subtitle.index),
        }))
      : [
          {
            key: "intelligence-auto",
            label: t("subtitleAuto"),
            url: `/api/addons/intelligence/files/${videoId}/subtitles.vtt`,
          },
        ];

  const [chosen, setChosen] = useState({ videoId, index: 0 });
  const index = chosen.videoId === videoId ? chosen.index : 0;
  // An unset preference asserts nothing, and the default track shows.
  // Per video, as a new element would start afresh.
  const [toggled, setToggled] = useState<{ videoId: string; on: boolean } | null>(null);
  const enabled = toggled?.videoId === videoId ? toggled.on : null;
  const on = (enabled ?? preferred) !== false;
  const selected = on ? index : -1;

  const url = tracks[index]?.url ?? null;
  const [loaded, setLoaded] = useState<{ url: string; cues: Cue[] } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => setLoaded({ url, cues: parseVtt(text) }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ url, cues: [] });
      });
    return () => controller.abort();
  }, [url]);
  const cues = loaded?.url === url ? loaded.cues : [];

  const state = useRef<CaptionsState>("unavailable");
  state.current = cues.length === 0 ? "unavailable" : on ? "on" : "off";

  const select = useCallback(
    (next: number) => {
      if (next >= 0) setChosen({ videoId, index: next });
      setToggled({ videoId, on: next >= 0 });
      setPreferred(next >= 0);
    },
    [setPreferred, videoId],
  );

  const get = useCallback(() => state.current, []);
  const set = useCallback((value: boolean) => setToggled({ videoId, on: value }), [videoId]);

  return { tracks, selected, cues: on ? cues : [], select, get, set };
}
