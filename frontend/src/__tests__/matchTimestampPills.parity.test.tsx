import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MatchOverlay } from "@/components/MatchOverlay";
import { MergedResultItem } from "@/components/search/MergedResultItem";
import type { FileItemWithMatch, MatchMeta } from "@/types";

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

const PILL_SURFACES = [
  "src/components/search/MergedResultItem.tsx",
  "src/components/MatchOverlay.tsx",
] as const;

const SRC_ROOT = resolve(__dirname, "..", "..");

function makeFile(overrides: Partial<FileItemWithMatch> = {}): FileItemWithMatch {
  return {
    image_width: null,
    image_height: null,
    id: "f1",
    filename: "lecture.mp4",
    title: "lecture",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 100,
    duration: 6000,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    match_meta: {},
    ...overrides,
  };
}

const SHARED_META: MatchMeta = {
  transcript: [
    { time_range: [799.2, 805], score: 0.8 },
    { time_range: [799.8, 806], score: 0.7 },
    { time_range: [889, 895], score: 0.6 },
  ],
  clip: [
    { time_range: [889, 893], score: 0.5 },
    { time_range: [3661, 3670], score: 0.4 },
    { time_range: [7322, 7330], score: 0.3 },
  ],
};

const pills = () => screen.getAllByTestId("match-timestamp-pill");
const pillTexts = () => pills().map((el) => el.textContent);

describe("timestamp pills read the same on both surfaces", () => {
  it("draws the same moments, in the same order, in the popup and on the page", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    const popup = pillTexts();
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    const page = pillTexts();
    cleanup();

    expect(popup).toEqual(["13:19", "14:49", "1:01:01"]);
    expect(page).toEqual(popup);
  });

  it("overflows by the same count on both surfaces", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    const popup = screen.getByText("+1");
    expect(popup).toBeInTheDocument();
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    expect(screen.getByText("+1")).toBeInTheDocument();
    cleanup();
  });

  it("both surfaces go through the shared helper", () => {
    expect(PILL_SURFACES.length).toBe(2);
    for (const surface of PILL_SURFACES) {
      const source = readFileSync(resolve(SRC_ROOT, surface), "utf8");
      expect(
        source.includes("collectMatchTimestamps"),
        `${surface} does not call collectMatchTimestamps`,
      ).toBe(true);
    }
  });

  it("the overflow marker is not a control", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    const marker = screen.getByText("+1");
    expect(marker.tagName).toBe("SPAN");
    expect(marker.getAttribute("role")).toBeNull();
    expect(marker.getAttribute("tabindex")).toBeNull();
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    const pageMarker = screen.getByText("+1");
    expect(pageMarker.tagName).toBe("SPAN");
    expect(pageMarker.closest("a")).toBeNull();
    cleanup();
  });

  it("spends no accent on the pills, on either surface", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    for (const pill of pills()) {
      expect(pill.className).not.toContain("text-accent");
      expect(pill.className).toContain("text-text-muted");
      expect(pill.className).toContain("hover:bg-accent/10");
    }
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    for (const pill of pills()) {
      expect(pill.className).not.toContain("text-accent");
      expect(pill.className).toContain("text-text-muted");
      expect(pill.className).toContain("hover:bg-accent/10");
    }
    cleanup();
  });
});
