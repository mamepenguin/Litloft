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

/**
 * The two **core** surfaces that draw timestamp pills, named rather than
 * found.
 *
 * Scanning for the callers would make the population whatever the tree
 * happens to hold, so a surface that stopped calling the helper would
 * shrink the population instead of failing — the detector would go green
 * on exactly the regression it exists for.
 *
 * Two limits, stated here because a test that does not name its blind
 * spots reads stronger than it is:
 *
 *  - **Core only.** Addons draw their own pills — `intelligence`'s
 *    `pages/search-compare.tsx` is one, with no cap and no
 *    de-duplication. `frontend/src/addons/*` are gitignored symlinks a
 *    checkout may or may not hold, so a core assertion about them passes
 *    or fails on what happens to be present; an addon's pills are counted
 *    in the addon's own repository.
 *  - **The source check greps.** A surface that imports the helper,
 *    mentions it, and then renders from a private copy stays green here.
 *    The render parity above is what makes that expensive to do by
 *    accident; nothing makes it impossible.
 */
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

/**
 * Exercises both halves of the rule at once — six segments naming four
 * moments, one of them found twice by two channels, and one pair a
 * fraction of a second apart.
 */
const SHARED_META: MatchMeta = {
  transcript: [
    { time_range: [799.2, 805], score: 0.8 },
    { time_range: [799.8, 806], score: 0.7 },
    { time_range: [889, 895], score: 0.6 },
  ],
  clip: [
    { time_range: [889, 893], score: 0.5 },
    { time_range: [1500, 1505], score: 0.4 },
    { time_range: [2400, 2405], score: 0.3 },
  ],
};

const pillTexts = () =>
  screen.getAllByText(/^\d+:\d{2}$/).map((el) => el.textContent);

describe("timestamp pills read the same on both surfaces", () => {
  /**
   * Two renders of two separately written components, not one function
   * called twice: the assertion is that the popup row and the results-page
   * overlay reach the same answer, which is what "shared rule" means.
   */
  it("draws the same moments, in the same order, in the popup and on the page", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    const popup = pillTexts();
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    const page = pillTexts();
    cleanup();

    expect(popup).toEqual(["13:19", "14:49", "25:00"]);
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

  /**
   * The render parity above stays green if one surface grows a second,
   * identical copy of the rule. Naming the helper in the source is what
   * says there is one rule rather than two that currently agree — as far
   * as a grep can say it; see the limits on `PILL_SURFACES`.
   */
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

  /**
   * The overflow marker says how many moments were dropped; it cannot say
   * which one, so there is nowhere for it to navigate.
   */
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

  /**
   * S-2. The pills were `text-accent` on both surfaces, which spent the
   * page's one loud colour on "there is also a hit at 13:19". They stay
   * clickable — the accent went, the affordance did not.
   */
  it("spends no accent on the pills, on either surface", () => {
    render(<MergedResultItem file={makeFile({ match_meta: SHARED_META })} onSelect={vi.fn()} />);
    for (const pill of screen.getAllByText(/^\d+:\d{2}$/)) {
      expect(pill.className).not.toContain("text-accent");
      expect(pill.className).toContain("text-text-muted");
      expect(pill.className).toContain("hover:bg-accent/10");
    }
    cleanup();

    render(<MatchOverlay match={SHARED_META} fileId="f1" />);
    for (const pill of screen.getAllByText(/^\d+:\d{2}$/)) {
      expect(pill.className).not.toContain("text-accent");
      expect(pill.className).toContain("text-text-muted");
      expect(pill.className).toContain("hover:bg-accent/10");
    }
    cleanup();
  });
});
