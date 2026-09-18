"use client";

import { useEffect, useState } from "react";
import { Check, MonitorPlay, PictureInPicture2, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAutoplayPreference } from "@/lib/autoplay";
import {
  enterPictureInPicture,
  exitPictureInPicture,
  isInPictureInPicture,
  supportsPictureInPicture,
} from "@/lib/backgroundPiP";
import { SettingToggle } from "../MediaControls/parts/SettingToggle";
import { useCaptionsPreference } from "../MediaControls/hooks/useCaptionsPreference";

interface VideoRowProps {
  video: HTMLVideoElement | null;
}

function textTracks(video: HTMLVideoElement): TextTrack[] {
  return Array.from({ length: video.textTracks.length }, (_, index) =>
    video.textTracks[index],
  ).filter((track): track is TextTrack => track !== null);
}

export function PictureInPictureToggle({ video }: VideoRowProps) {
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
    <SettingToggle
      label={t("pictureInPicture")}
      checked={active}
      onChange={(next) => {
        void (next ? enterPictureInPicture(video) : exitPictureInPicture(video))
          .then(() => setActive(isInPictureInPicture(video)))
          .catch(() => {});
      }}
    >
      <PictureInPicture2 size={18} aria-hidden="true" />
    </SettingToggle>
  );
}

export function NativeAutoplayToggle() {
  const t = useTranslations("player");
  const [enabled, setEnabled] = useAutoplayPreference();

  return (
    <SettingToggle label={t("autoplay")} checked={enabled} onChange={setEnabled}>
      <Play size={18} aria-hidden="true" />
    </SettingToggle>
  );
}

export interface NativePlayerUiToggleProps {
  browser: boolean;
  onChange: (browser: boolean) => void;
}

export function NativePlayerUiToggle({
  browser,
  onChange,
}: NativePlayerUiToggleProps) {
  const t = useTranslations("player");

  return (
    <SettingToggle
      label={t("browserControls")}
      checked={browser}
      onChange={onChange}
    >
      <MonitorPlay size={18} aria-hidden="true" />
    </SettingToggle>
  );
}

export function SubtitleTrackPicker({ video }: VideoRowProps) {
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

  // One track is what the core toggle already covers.
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
    <SubtitleTrackOptions
      options={tracks.map((track, index) => ({
        key: track.id || `${track.language}-${index}`,
        label: track.label || track.language || `${index + 1}`,
      }))}
      selected={selected}
      onSelect={select}
    />
  );
}

export interface SubtitleTrackOptionsProps {
  options: { key: string; label: string }[];
  /** -1 for off. */
  selected: number;
  onSelect: (index: number) => void;
}

export function SubtitleTrackOptions({ options, selected, onSelect }: SubtitleTrackOptionsProps) {
  const t = useTranslations("player");
  const optionClass = (checked: boolean) =>
    [
      "inline-flex h-11 items-center justify-center gap-1 rounded-2xl px-3 text-sm",
      "transition-colors motion-reduce:transition-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      checked ? "bg-white/20 font-medium" : "hover:bg-white/10",
    ].join(" ");

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
          onClick={() => onSelect(-1)}
          className={optionClass(selected === -1)}
        >
          {selected === -1 && <Check size={14} aria-hidden="true" />}
          {t("subtitleTrackOff")}
        </button>
        {options.map((option, index) => {
          const checked = selected === index;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(index)}
              className={optionClass(checked)}
            >
              {checked && <Check size={14} aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface NativeToggleButtonsProps extends VideoRowProps {
  browserControls: boolean;
  onBrowserControlsChange: (browser: boolean) => void;
}

export function NativeToggleButtons({
  video,
  browserControls,
  onBrowserControlsChange,
}: NativeToggleButtonsProps) {
  return (
    <>
      <PictureInPictureToggle video={video} />
      <NativeAutoplayToggle />
      <NativePlayerUiToggle
        browser={browserControls}
        onChange={onBrowserControlsChange}
      />
    </>
  );
}
