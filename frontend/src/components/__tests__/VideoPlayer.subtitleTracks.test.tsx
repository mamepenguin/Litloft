import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

import type { SubtitleInfo } from "@/types";
import { VideoPlayer } from "../VideoPlayer";

vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
  clearProgress: vi.fn(),
}));

function sub(overrides: Record<string, unknown> = {}): SubtitleInfo {
  return {
    index: 0,
    language: "ja",
    format: "srt",
    label: "",
    filename: "The Long Night.ja.srt",
    shared_with: 0,
    version: "2222222222222222222",
    ...overrides,
  } as SubtitleInfo;
}

function trackByLabel(label: string): HTMLTrackElement {
  const track = Array.from(document.querySelectorAll<HTMLTrackElement>("track")).find(
    (element) => element.getAttribute("label") === label,
  );
  if (!track) throw new Error(`no track labelled ${label}`);
  return track;
}

interface FakeTextTrack {
  mode: string;
}

type FakeTextTrackList = EventTarget & {
  length: number;
  [index: number]: FakeTextTrack;
};

/**
 * jsdom has no text tracks, so the player's modes have to be driven by hand.
 * The list stays the same object across a rerender: the player listens to it.
 */
function fakeTextTrackList(modes: string[]): FakeTextTrackList {
  const list = new EventTarget() as FakeTextTrackList;
  list.length = 0;
  for (const mode of modes) appendMode(list, mode);
  return list;
}

function appendMode(list: FakeTextTrackList, mode: string): void {
  list[list.length] = { mode };
  list.length += 1;
}

function prependMode(list: FakeTextTrackList, mode: string): void {
  for (let index = list.length; index > 0; index -= 1) {
    list[index] = list[index - 1];
  }
  list[0] = { mode };
  list.length += 1;
}

let textTracks: FakeTextTrackList | null = null;

beforeEach(() => {
  textTracks = null;
  Object.defineProperty(HTMLMediaElement.prototype, "textTracks", {
    configurable: true,
    get: () => textTracks,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
});

afterEach(() => {
  delete (HTMLMediaElement.prototype as { textTracks?: unknown }).textTracks;
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-185 I12: the player's tracks follow the list", () => {
  const bare = sub({
    index: 0,
    language: "",
    filename: "The Long Night.srt",
    label: "A",
    version: "1111111111111111111",
  });
  const japanese = sub({
    index: 1,
    language: "ja",
    filename: "The Long Night.ja.srt",
    label: "B",
    version: "2222222222222222222",
  });
  const dutch = sub({
    index: 0,
    language: "nl",
    filename: "The Long Night.nl.srt",
    label: "Z",
    version: "3333333333333333333",
  });

  it("puts the sidecar's version in the track URL", () => {
    render(<VideoPlayer videoId="v1" subtitles={[japanese]} />);

    const track = trackByLabel("B");
    expect(track.getAttribute("src")).toContain(japanese.version);
  });

  it("keeps a track's element across an add of another track", () => {
    const { rerender } = render(
      <VideoPlayer videoId="v1" subtitles={[bare, japanese]} />,
    );
    const before = trackByLabel("B");

    rerender(
      <VideoPlayer
        videoId="v1"
        subtitles={[
          dutch,
          { ...bare, index: 1 },
          { ...japanese, index: 2 },
        ]}
      />,
    );

    expect(trackByLabel("B")).toBe(before);
    expect(trackByLabel("Z").getAttribute("src")).toContain(dutch.version);
    expect(document.querySelectorAll("track")).toHaveLength(3);
  });

  it("gives a replaced track a new URL while it keeps its element", () => {
    const { rerender } = render(
      <VideoPlayer videoId="v1" subtitles={[bare, japanese]} />,
    );
    const before = trackByLabel("B");
    expect(before.getAttribute("src")).toContain(japanese.version);

    const replaced = { ...japanese, version: "4444444444444444444" };
    rerender(<VideoPlayer videoId="v1" subtitles={[bare, replaced]} />);

    const after = trackByLabel("B");
    expect(after).toBe(before);
    expect(after.getAttribute("src")).toContain("4444444444444444444");
    expect(after.getAttribute("src")).not.toContain(japanese.version);
  });

  it("shows the first remaining track when the track being shown is deleted", () => {
    textTracks = fakeTextTrackList(["showing", "disabled"]);
    const { rerender } = render(
      <VideoPlayer videoId="v1" subtitles={[bare, japanese]} />,
    );
    textTracks[0].mode = "disabled";
    textTracks[1].mode = "showing";
    act(() => textTracks!.dispatchEvent(new Event("change")));

    textTracks.length = 1;
    rerender(<VideoPlayer videoId="v1" subtitles={[bare]} />);

    expect(textTracks![0].mode).toBe("showing");
  });

  it("keeps only the track being shown showing when another is added before it", () => {
    textTracks = fakeTextTrackList(["showing"]);
    const { rerender } = render(
      <VideoPlayer videoId="v1" subtitles={[japanese]} />,
    );
    act(() => textTracks!.dispatchEvent(new Event("change")));

    prependMode(textTracks!, "disabled");
    rerender(<VideoPlayer videoId="v1" subtitles={[dutch, japanese]} />);

    expect(trackByLabel("Z").hasAttribute("default")).toBe(false);
    expect(trackByLabel("B").hasAttribute("default")).toBe(true);
    expect(textTracks[0].mode).toBe("disabled");
    expect(textTracks[1].mode).toBe("showing");
    expect(
      Array.from({ length: textTracks.length }, (_, index) => textTracks![index]).filter(
        (track) => track.mode === "showing",
      ),
    ).toHaveLength(1);
  });
});
