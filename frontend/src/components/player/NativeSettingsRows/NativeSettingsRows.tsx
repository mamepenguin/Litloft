"use client";

import { useEffect, useState } from "react";
import { Check, PictureInPicture2, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAutoplayPreference } from "@/lib/autoplay";
import {
  enterPictureInPicture,
  isInPictureInPicture,
  supportsPictureInPicture,
} from "@/lib/backgroundPiP";
import { useCaptionsPreference } from "../MediaControls/hooks/useCaptionsPreference";

interface VideoRowProps {
  video: HTMLVideoElement | null;
}

const buttonClass = [
  "inline-flex h-11 items-center justify-center gap-1 rounded-2xl px-3 text-sm",
  "transition-colors motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
].join(" ");

function textTracks(video: HTMLVideoElement): TextTrack[] {
  return Array.from({ length: video.textTracks.length }, (_, index) =>
    video.textTracks[index],
  ).filter((track): track is TextTrack => track !== null);
}

export function PictureInPictureRow({ video }: VideoRowProps) {
  const t = useTranslations("player");
  const [active, setActive] = useState(
    () => video != null && isInPictureInPicture(video),
  );

  useEffect(() => {
    if (!video) return;
    const update = () => setActive(isInPictureInPicture(video));
    update();
    video.addEventListener("enterpictureinpicture", update);
    video.addEventListener("leavepictureinpicture", update);
    video.addEventListener("webkitpresentationmodechanged", update);
    return () => {
      video.removeEventListener("enterpictureinpicture", update);
      video.removeEventListener("leavepictureinpicture", update);
      video.removeEventListener("webkitpresentationmodechanged", update);
    };
  }, [video]);

  if (!video || !supportsPictureInPicture(video)) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="px-1 text-sm">{t("pictureInPicture")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={t("pictureInPicture")}
        onClick={() => {
          void enterPictureInPicture(video)
            .then(() => setActive(isInPictureInPicture(video)))
            .catch(() => {});
        }}
        className={`${buttonClass} ${
          active ? "bg-white/20 font-medium" : "hover:bg-white/10"
        }`}
      >
        {active ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <PictureInPicture2 size={14} aria-hidden="true" />
        )}
        {t("pictureInPicture")}
      </button>
    </div>
  );
}

export function SubtitleTrackPicker({ video }: VideoRowProps) {
  const t = useTranslations("player");
  const [, setCaptionsPreferred] = useCaptionsPreference();
  const [, setVersion] = useState(0);
  const tracks = video ? textTracks(video) : [];

  useEffect(() => {
    if (!video) return;
    const list = video.textTracks;
    if (typeof list.addEventListener !== "function") return;
    const update = () => setVersion((version) => version + 1);
    list.addEventListener("change", update);
    list.addEventListener("addtrack", update);
    list.addEventListener("removetrack", update);
    return () => {
      list.removeEventListener("change", update);
      list.removeEventListener("addtrack", update);
      list.removeEventListener("removetrack", update);
    };
  }, [video]);

  if (tracks.length <= 1) return null;

  const selected = tracks.findIndex((track) => track.mode === "showing");
  const select = (selectedIndex: number) => {
    tracks.forEach((track, index) => {
      track.mode = index === selectedIndex ? "showing" : "disabled";
    });
    setCaptionsPreferred(selectedIndex !== -1);
    setVersion((version) => version + 1);
  };

  return (
    <div role="radiogroup" aria-label={t("subtitleTrack")}>
      <div className="px-1 pb-1.5 text-xs font-medium text-white/70">
        {t("subtitleTrack")}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          role="radio"
          aria-checked={selected === -1}
          onClick={() => select(-1)}
          className={`${buttonClass} ${
            selected === -1 ? "bg-white/20 font-medium" : "hover:bg-white/10"
          }`}
        >
          {selected === -1 && <Check size={14} aria-hidden="true" />}
          {t("subtitleTrackOff")}
        </button>
        {tracks.map((track, index) => {
          const checked = selected === index;
          const label = track.label || track.language || `${index + 1}`;
          return (
            <button
              key={track.id || `${track.language}-${index}`}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => select(index)}
              className={`${buttonClass} ${
                checked ? "bg-white/20 font-medium" : "hover:bg-white/10"
              }`}
            >
              {checked && <Check size={14} aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NativeAutoplayRow() {
  const t = useTranslations("player");
  const [enabled, setEnabled] = useAutoplayPreference();

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="px-1 text-sm">{t("autoplay")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t("autoplay")}
        onClick={() => setEnabled(!enabled)}
        className={`${buttonClass} ${
          enabled ? "bg-white/20 font-medium" : "hover:bg-white/10"
        }`}
      >
        {enabled ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Play size={14} aria-hidden="true" />
        )}
        {enabled ? t("autoplayOn") : t("autoplayOff")}
      </button>
    </div>
  );
}

export function NativeSettingsRows({ video }: VideoRowProps) {
  return (
    <>
      <PictureInPictureRow video={video} />
      <SubtitleTrackPicker video={video} />
      <NativeAutoplayRow />
    </>
  );
}
