import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NativeAutoplayRow,
  PictureInPictureRow,
  SubtitleTrackPicker,
} from "../NativeSettingsRows";

function videoWithTracks(
  tracks: Array<{ label: string; language: string; mode?: TextTrackMode }>,
): { video: HTMLVideoElement; textTracks: TextTrack[] } {
  const video = document.createElement("video");
  const textTracks = tracks.map(
    ({ label, language, mode = "disabled" }, index) =>
      ({
        id: `track-${index}`,
        kind: "subtitles",
        label,
        language,
        mode,
      }) as TextTrack,
  );
  const list = Object.assign(
    new EventTarget(),
    { length: textTracks.length, item: (index: number) => textTracks[index] ?? null },
    textTracks,
  );
  Object.defineProperty(video, "textTracks", {
    configurable: true,
    value: list,
  });
  return { video, textTracks };
}

describe("native settings rows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: false,
    });
  });

  it("hides Picture-in-Picture when the video does not support it", () => {
    render(<PictureInPictureRow video={document.createElement("video")} />);
    expect(
      screen.queryByRole("switch", { name: "Picture-in-Picture" }),
    ).toBeNull();
  });

  it("offers a 44px Picture-in-Picture switch and enters PiP", async () => {
    const video = document.createElement("video");
    const requestPictureInPicture = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "requestPictureInPicture", {
      configurable: true,
      value: requestPictureInPicture,
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });

    render(<PictureInPictureRow video={video} />);
    const row = screen.getByRole("switch", { name: "Picture-in-Picture" });
    expect(row).toHaveClass("h-11");
    fireEvent.click(row);
    await waitFor(() => expect(requestPictureInPicture).toHaveBeenCalledOnce());
  });

  it("hides the track picker unless more than one track exists", () => {
    const { video } = videoWithTracks([{ label: "English", language: "en" }]);
    render(<SubtitleTrackPicker video={video} />);
    expect(
      screen.queryByRole("radiogroup", { name: "Subtitle track" }),
    ).toBeNull();
  });

  it("renders Off plus every track and drives textTrack.mode", () => {
    const { video, textTracks } = videoWithTracks([
      { label: "English", language: "en", mode: "showing" },
      { label: "日本語", language: "ja" },
    ]);
    render(<SubtitleTrackPicker video={video} />);

    const picker = screen.getByRole("radiogroup", { name: "Subtitle track" });
    const off = screen.getByRole("radio", { name: "Off" });
    const english = screen.getByRole("radio", { name: "English" });
    const japanese = screen.getByRole("radio", { name: "日本語" });
    expect(picker).toBeInTheDocument();
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(japanese).toHaveClass("h-11");

    fireEvent.click(japanese);
    expect(textTracks.map((track) => track.mode)).toEqual([
      "disabled",
      "showing",
    ]);
    expect(japanese).toHaveAttribute("aria-checked", "true");

    fireEvent.click(off);
    expect(textTracks.map((track) => track.mode)).toEqual([
      "disabled",
      "disabled",
    ]);
    expect(off).toHaveAttribute("aria-checked", "true");
  });

  it("renders autoplay as a labelled switch and stores its choice", () => {
    render(<NativeAutoplayRow />);
    const row = screen.getByRole("switch", { name: "Autoplay" });
    expect(row).toHaveClass("h-11");
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(row).toHaveTextContent("Autoplay OFF");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(row).toHaveTextContent("Autoplay ON");
    expect(window.localStorage.getItem("video-share-autoplay")).toBe("true");
  });
});
