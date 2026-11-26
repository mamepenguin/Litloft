import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

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

beforeEach(() => {
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
});
