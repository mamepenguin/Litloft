import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NativeAutoplayToggle,
  PictureInPictureToggle,
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
    render(<PictureInPictureToggle video={document.createElement("video")} />);
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

    render(<PictureInPictureToggle video={video} />);
    const row = screen.getByRole("switch", { name: "Picture-in-Picture" });
    expect(row).toHaveClass("h-11");
    fireEvent.click(row);
    await waitFor(() => expect(requestPictureInPicture).toHaveBeenCalledOnce());
  });

  it("leaves Picture-in-Picture again when it is already on", async () => {
    // It renders as a switch, so pressing it while on has to turn it
    // off. The standard route out goes through `document`, not the
    // element, which is why entering and leaving are not symmetric.
    const video = document.createElement("video");
    const exitPictureInPicture = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "requestPictureInPicture", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: video,
    });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: exitPictureInPicture,
    });

    render(<PictureInPictureToggle video={video} />);
    const row = screen.getByRole("switch", { name: "Picture-in-Picture" });
    expect(row).toHaveAttribute("aria-checked", "true");
    fireEvent.click(row);
    await waitFor(() => expect(exitPictureInPicture).toHaveBeenCalledOnce());

    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
    });
  });

  it("falls back to WebKit presentation mode when leaving", async () => {
    const video = document.createElement("video");
    const webkitSetPresentationMode = vi.fn();
    Object.defineProperty(video, "webkitSupportsPresentationMode", {
      configurable: true,
      value: (mode: string) => mode === "picture-in-picture",
    });
    Object.defineProperty(video, "webkitPresentationMode", {
      configurable: true,
      value: "picture-in-picture",
    });
    Object.defineProperty(video, "webkitSetPresentationMode", {
      configurable: true,
      value: webkitSetPresentationMode,
    });

    render(<PictureInPictureToggle video={video} />);
    const row = screen.getByRole("switch", { name: "Picture-in-Picture" });
    expect(row).toHaveAttribute("aria-checked", "true");
    fireEvent.click(row);
    await waitFor(() =>
      expect(webkitSetPresentationMode).toHaveBeenCalledWith("inline"),
    );
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

  it("renders autoplay as an icon switch and stores its choice", () => {
    // Icon-only, so the name lives on `aria-label` and the state on
    // `aria-checked` — there is no visible text to assert. `title`
    // repeats the name for a pointer hover.
    render(<NativeAutoplayToggle />);
    const row = screen.getByRole("switch", { name: "Autoplay" });
    expect(row).toHaveClass("h-11", "w-11");
    expect(row).toHaveAttribute("title", "Autoplay");
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(row).toHaveTextContent("");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("video-share-autoplay")).toBe("true");
  });
});
