"use client";

import { useEffect, useRef, useState } from "react";

import type { SubtitleInfo } from "@/types";

export const GENERATED_CAPTION_TRACK_KEY = "intelligence-auto";

/**
 * Tracks are keyed by file name, so an add or a delete leaves every track
 * it did not change on the same element. An index would move the choice to
 * whichever file now sits there.
 */
function captionTrackKeys(subtitles: readonly SubtitleInfo[]): string[] {
  if (subtitles.length === 0) return [GENERATED_CAPTION_TRACK_KEY];
  return subtitles.map((subtitle) => subtitle.filename ?? String(subtitle.index));
}

/**
 * The track the viewer is watching, kept across a list that changes under
 * it. A `<track default>` is applied when its element is inserted, so an
 * element added ahead of the shown one would otherwise show with it; and
 * removing the shown element does not make the browser pick another, so
 * every remaining track would stay disabled.
 */
export function useCaptionTrackSelection(
  video: HTMLVideoElement | null,
  subtitles: readonly SubtitleInfo[],
): string {
  const keys = captionTrackKeys(subtitles);
  const signature = keys.join("\u0000");
  const [selection, setSelection] = useState(() => ({ signature, key: keys[0] }));
  let chosenKey = selection.key;
  if (selection.signature !== signature) {
    chosenKey = keys.includes(selection.key) ? selection.key : keys[0];
    setSelection({ signature, key: chosenKey });
  }

  const keysRef = useRef(keys);
  keysRef.current = keys;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const chosenRef = useRef(chosenKey);
  chosenRef.current = chosenKey;
  const previousChosen = useRef(chosenKey);
  const captionsOn = useRef(false);

  useEffect(() => {
    if (!video) return;
    const tracks = video.textTracks;
    if (!tracks || typeof tracks.addEventListener !== "function") return;

    const onChange = () => {
      let showing = -1;
      for (let index = 0; index < tracks.length; index += 1) {
        if (tracks[index]?.mode === "showing") {
          showing = index;
          break;
        }
      }
      captionsOn.current = showing >= 0;
      const key = showing >= 0 ? keysRef.current[showing] : undefined;
      if (!key || key === chosenRef.current) return;
      chosenRef.current = key;
      setSelection({ signature: signatureRef.current, key });
    };

    tracks.addEventListener("change", onChange);
    return () => tracks.removeEventListener("change", onChange);
  }, [video]);

  useEffect(() => {
    if (!video) return;
    const tracks = video.textTracks;
    if (!tracks) return;
    const chosenIndex = keysRef.current.indexOf(chosenKey);
    if (chosenIndex < 0) return;

    let anyShowing = false;
    for (let index = 0; index < tracks.length; index += 1) {
      if (tracks[index]?.mode === "showing") {
        anyShowing = true;
        break;
      }
    }

    if (previousChosen.current !== chosenKey && captionsOn.current) {
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (track) track.mode = index === chosenIndex ? "showing" : "disabled";
      }
    } else if (anyShowing) {
      captionsOn.current = true;
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (track && index !== chosenIndex && track.mode === "showing") {
          track.mode = "disabled";
        }
      }
    }
    previousChosen.current = chosenKey;
  }, [video, signature, chosenKey]);

  return chosenKey;
}
