import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";
import { SHEET_PEEK_PX, SHEET_SNAP_HALF_FALLBACK } from "@/lib/sheetSnap";
import {
  SHEET_PEEK_HEIGHT,
  SHEET_VISIBLE_HEIGHT,
} from "@/components/MobileInspectorSheet";
import { CANVAS_PADDING_REM } from "@/lib/layoutSizes";
import {
  claimSlot,
  loaded,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  slotMocks,
  usePolicyMock,
  withRelations,
} from "./harness";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../related/RelatedPanel", async () => ({
  RelatedPanel: (await import("./harness")).RelatedPanelStub,
}));
vi.mock("../related/useFileRelations", async () => ({
  useFileRelations: (await import("./harness")).useFileRelationsStub,
}));

beforeEach(() => {
  relationMocks.value = [];
});
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
vi.mock("../../EditableTagChips", async () => ({
  EditableTagChips: (await import("./harness")).EditableTagChipsStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../ChaptersPanel", async () => ({
  ChaptersPanel: (await import("./harness")).ChaptersPanelStub,
}));
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const TRANSCRIPT = {
  id: "transcript",
  label: "Transcript",
  priority: 10,
  addonName: "intelligence",
};

function withTranscript() {
  claimSlot("player-side", [TRANSCRIPT]);
}

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-media-layout");
  setViewport();
});

async function renderMedia(file: FileItem = makeFile({ has_chapters: true })) {
  setApiResponses(file);
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await loaded();
  return utils;
}

/**
 * `loaded()` waits for `file-actions`, which lives in the inspector, so it
 * never arrives where the inspector starts closed.
 */
async function renderMediaAwaitingChrome(
  file: FileItem = makeFile({ has_chapters: true }),
) {
  setApiResponses(file);
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await screen.findByTestId("file-detail-chrome");
  return utils;
}

const tabs = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent?.trim());

const layoutToggle = () =>
  screen.queryByRole("button", {
    name: /transcript (beside|below) the player/i,
  });

describe("media on the shell, beside", () => {
  it("grows one tab per occupant and no more", async () => {
    withTranscript();
    await renderMedia();

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });

  it("leaves the chapters tab out for a file that has none", async () => {
    withTranscript();
    await renderMedia(makeFile({ has_chapters: false }));

    expect(tabs()).toEqual(["Info", "Transcript"]);
  });

  it("draws no strip at all when the file has only Info", async () => {
    await renderMedia(makeFile({ has_chapters: false }));

    expect(tabs()).toEqual([]);
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
  });

  it("mounts the occupant in the tab and nowhere else", async () => {
    withTranscript();
    const { container } = await renderMedia();

    expect(screen.getAllByTestId("slot-entry-transcript")).toHaveLength(1);
    expect(screen.getAllByTestId("chapters-panel")).toHaveLength(1);
    expect(container.querySelector(".media-detail-below")).toBeNull();
  });

  it("gives every tab the touch floor, on the row", async () => {
    // `classList` rather than a substring test: `pointer-coarse:min-h-11`
    // contains `min-h-11`, so `toContain` would pass on the conditional class alone.
    withTranscript();
    await renderMedia();

    const strip = screen.getByTestId("inspector-tabs");
    expect(strip.classList.contains("pointer-coarse:min-h-11")).toBe(true);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.classList.contains("pointer-coarse:min-h-11")).toBe(true);
    }
  });

  it("asks the occupant to fill the panel it was given", async () => {
    withTranscript();
    await renderMedia();

    expect(screen.getByTestId("slot-entry-transcript")).toHaveAttribute(
      "data-fill-height",
      "true",
    );
  });

  it("lists no Related tab for a file with no relation and no derived source", async () => {
    withTranscript();
    await renderMedia();

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
    expect(screen.queryByTestId("related-panel")).toBeNull();
  });

  it("lists Related after the core tabs and before the addon tabs when the file has a relation", async () => {
    withTranscript();
    withRelations(2);
    await renderMedia();

    expect(tabs()).toEqual(["Info", "Chapters", "Related", "Transcript"]);
    const panel = screen.getByTestId("related-panel");
    expect(panel).toHaveAttribute("data-count", "2");
    expect(
      document.getElementById("inspector-panel-related"),
    ).toContainElement(panel);
  });

  it("lists Related for a file with no relation when an addon publishes to it", async () => {
    claimSlot("file-relations", [
      { id: "derived", label: "Derived", priority: 10, addonName: "some-addon" },
    ]);
    await renderMedia(makeFile({ has_chapters: false }));

    expect(tabs()).toEqual(["Info", "Related"]);
    expect(screen.getByTestId("related-panel")).toHaveAttribute("data-count", "0");
  });

  it("draws no relations in the Info tab", async () => {
    withRelations(1);
    claimSlot("file-relations", [
      { id: "derived", label: "Derived", priority: 10, addonName: "some-addon" },
    ]);
    await renderMedia();

    const info = document.getElementById("inspector-panel-info")!;
    expect(info).not.toContainElement(screen.getByTestId("related-panel"));
    expect(info.querySelector("[data-testid='addon-slot-file-relations']")).toBeNull();
    expect(screen.getAllByTestId("related-panel")).toHaveLength(1);
  });

  it("drops the Related tab while the relations are still unanswered", async () => {
    relationMocks.value = null;
    withTranscript();
    await renderMedia();

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });

  it("keeps the beside/below toggle off a phone", async () => {
    withTranscript();
    setViewport(400);
    await renderMediaAwaitingChrome();

    expect(layoutToggle()).toBeNull();
  });

  it("tells the occupant its name is already on the button", async () => {
    withTranscript();
    await renderMedia();

    expect(screen.getByTestId("slot-entry-transcript")).toHaveAttribute(
      "data-labelled-by-host",
      "true",
    );
  });
});

describe("an occupant with nothing for this file", () => {
  it("loses its tab but not its mount", async () => {
    withTranscript();
    await renderMedia();
    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
    const before = screen.getByTestId("slot-entry-transcript");

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(tabs()).toEqual(["Info", "Chapters"]);
    expect(screen.getByTestId("slot-entry-transcript")).toBe(before);
  });

  it("gets the tab back the moment it has something", async () => {
    withTranscript();
    await renderMedia();
    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));
    expect(tabs()).toEqual(["Info", "Chapters"]);

    fireEvent.click(screen.getByTestId("slot-entry-transcript-filled"));

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });

  it("takes the layout toggle with it when it is the only occupant", async () => {
    withTranscript();
    await renderMedia(makeFile({ has_chapters: false }));
    expect(layoutToggle()).not.toBeNull();

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(layoutToggle()).toBeNull();
  });

  it("leaves the toggle alone while core still fills the region", async () => {
    withTranscript();
    await renderMedia(makeFile({ has_chapters: true }));

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(layoutToggle()).not.toBeNull();
  });

  it("forgets the answer when the reader opens another file", async () => {
    withTranscript();
    const { rerender } = await renderMedia();
    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));
    expect(tabs()).toEqual(["Info", "Chapters"]);

    setApiResponses(makeFile({ id: "f2", has_chapters: true }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await loaded();

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });
});

describe("an occupant with nothing for this file, below", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
  });

  it("hides the box without unmounting what is in it", async () => {
    withTranscript();
    const { container } = await renderMedia(makeFile({ has_chapters: false }));
    const box = () => container.querySelector(".media-detail-below");
    expect(box()).toHaveAttribute("data-occupied", "true");
    const before = screen.getByTestId("slot-entry-transcript");

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(box()).toHaveAttribute("data-occupied", "false");
    expect(screen.getByTestId("slot-entry-transcript")).toBe(before);

    fireEvent.click(screen.getByTestId("slot-entry-transcript-filled"));
    expect(box()).toHaveAttribute("data-occupied", "true");
  });

  it("keeps the order the addons declared", async () => {
    // Declared out of order on purpose: with them already sorted an
    // unsorted build would be indistinguishable from a sorted one.
    claimSlot("player-side", [
      { ...TRANSCRIPT, id: "late", priority: 90 },
      { ...TRANSCRIPT, id: "early", priority: 10 },
    ]);
    const { container } = await renderMedia();

    const body = container.querySelector(".media-detail-below-body")!;
    const ids = [...body.querySelectorAll("[data-testid^='slot-entry-']")]
      .map((node) => node.getAttribute("data-testid"))
      .filter((id) => id && !id.endsWith("-empty") && !id.endsWith("-filled"));
    expect(ids).toEqual(["slot-entry-early", "slot-entry-late"]);
  });

  it("does not claim the canvas already named the occupant", async () => {
    withTranscript();
    await renderMedia();

    expect(screen.getByTestId("slot-entry-transcript")).toHaveAttribute(
      "data-labelled-by-host",
      "false",
    );
  });
});

describe("media on the shell, below", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
  });

  it("puts the companion in the canvas and takes the strip away", async () => {
    withTranscript();
    const { container } = await renderMedia();

    const box = container.querySelector(".media-detail-below");
    expect(box).not.toBeNull();
    expect(box!.querySelector(".media-detail-below-index")).not.toBeNull();
    expect(box!.querySelector(".media-detail-below-body")).not.toBeNull();
    expect(tabs()).toEqual([]);
  });

  it("still mounts each occupant exactly once", async () => {
    withTranscript();
    const { container } = await renderMedia();

    const entries = screen.getAllByTestId("slot-entry-transcript");
    expect(entries).toHaveLength(1);
    expect(container.querySelector(".media-detail-below-body")).toContainElement(
      entries[0],
    );
    expect(tabs()).toEqual([]);
    expect(screen.getAllByTestId("chapters-panel")).toHaveLength(1);
  });

  it("draws no box at all when nothing would go in it", async () => {
    const { container } = await renderMedia(makeFile({ has_chapters: false }));

    expect(container.querySelector(".media-detail-below")).toBeNull();
    expect(layoutToggle()).toBeNull();
  });

  it("gives the body the index's width back when there are no chapters", async () => {
    withTranscript();
    const { container } = await renderMedia(makeFile({ has_chapters: false }));

    const box = container.querySelector(".media-detail-below");
    expect(box).not.toBeNull();
    expect(box!.querySelector(".media-detail-below-index")).toBeNull();
    expect(box!.querySelector(".media-detail-below-body")).not.toBeNull();
  });
});

describe("switching between the two forms", () => {
  it("moves the companion without rebuilding the player", async () => {
    withTranscript();
    const { container } = await renderMedia();
    const player = screen.getByTestId("file-preview");
    expect(container.querySelector(".media-detail-below")).toBeNull();

    fireEvent.click(layoutToggle()!);

    await waitFor(() =>
      expect(container.querySelector(".media-detail-below")).not.toBeNull(),
    );
    expect(screen.getByTestId("file-preview")).toBe(player);
    const entries = screen.getAllByTestId("slot-entry-transcript");
    expect(entries).toHaveLength(1);
    expect(container.querySelector(".media-detail-below-body")).toContainElement(
      entries[0],
    );
  });

  it("opens the inspector when the swap puts the panel in it", async () => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    window.localStorage.setItem(inspectorOpenStorageKey("main"), "false");
    withTranscript();
    await renderMediaAwaitingChrome();
    expect(screen.queryByTestId("inspector-pane")).toBeNull();

    fireEvent.click(layoutToggle()!);

    await screen.findByTestId("inspector-pane");
    expect(screen.getAllByTestId("slot-entry-transcript")).toHaveLength(1);
  });

  it("leaves the inspector alone going the other way", async () => {
    window.localStorage.setItem(inspectorOpenStorageKey("main"), "false");
    withTranscript();
    const { container } = await renderMediaAwaitingChrome();

    fireEvent.click(layoutToggle()!);

    expect(screen.queryByTestId("inspector-pane")).toBeNull();
    const entries = screen.getAllByTestId("slot-entry-transcript");
    expect(entries).toHaveLength(1);
    expect(container.querySelector(".media-detail-below-body")).toContainElement(
      entries[0],
    );
  });

  it("offers the swap from the page row", async () => {
    withTranscript();
    await renderMedia();

    const row = screen.getByTestId("file-detail-chrome");
    expect(row).toContainElement(layoutToggle());
  });

  it("offers nothing when the region has no occupant to move", async () => {
    await renderMedia(makeFile({ has_chapters: false }));

    expect(layoutToggle()).toBeNull();
  });
});

describe("media on the shell, on a phone", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    setViewport(400);
  });

  it("keeps the companion out of the canvas whatever the preference says", async () => {
    withTranscript();
    const { container } = await renderMediaAwaitingChrome();

    expect(container.querySelector(".media-detail-below")).toBeNull();
  });

  it("rests at the peek row, with the file's name and its actions", async () => {
    await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false, title: "Sample" }),
    );

    const peek = await screen.findByTestId("mobile-inspector-peek");
    expect(peek).toHaveTextContent("Sample");
    expect(peek).toContainElement(screen.getByTestId("file-action-row"));
    expect(screen.getAllByTestId("file-action-row")).toHaveLength(1);
  });

  it("carries only the four controls the strip is specified as", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));

    const peek = await screen.findByTestId("mobile-inspector-peek");
    expect(peek.querySelector("[data-testid='trust-tier-state']")).toBeNull();
    expect(peek).not.toHaveTextContent(/Unverified|未検証/);
    const row = screen.getByTestId("file-action-row");
    expect(row.classList.contains("file-action-row-compact")).toBe(true);
    expect(row.classList.contains("file-action-row-touch")).toBe(true);
  });

  it("gives the raised sheet the row in full, not the strip's compaction", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    await screen.findByTestId("mobile-inspector-peek");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");

    expect(screen.queryByTestId("mobile-inspector-peek")).toBeNull();
    const row = screen.getByTestId("file-action-row");
    expect(row.classList.contains("file-action-row-compact")).toBe(false);
    expect(row.querySelector("[data-testid='trust-tier-state']")).not.toBeNull();
    expect(row.querySelector("[data-testid='cast']")).not.toBeNull();
  });

  it("ends the page above the strip it rests behind, home indicator included", async () => {
    const { container } = await renderMediaAwaitingChrome();
    const style = container.querySelector("main")?.getAttribute("style") ?? "";
    expect(style).toMatch(/padding-bottom:\s*calc\(56px \+ env\(/);
    expect(style).toContain("safe-area-inset-bottom");
  });

  it("leaves addon buttons off the strip and puts them in the raised sheet, once", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));

    const peek = await screen.findByTestId("mobile-inspector-peek");
    expect(peek.querySelector("[data-testid='addon-slot-file-detail-actions']")).toBeNull();
    expect(peek.querySelector("[data-testid='file-actions']")).not.toBeNull();
    expect(screen.queryAllByTestId("addon-slot-file-detail-actions")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.getAllByTestId("addon-slot-file-detail-actions")).toHaveLength(1);
    expect(sheet).toContainElement(
      screen.getByTestId("addon-slot-file-detail-actions"),
    );
  });

  it("gives the sheet the same tab set, Related included", async () => {
    withTranscript();
    withRelations(1);
    await renderMediaAwaitingChrome();

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");

    expect(tabs()).toEqual(["Info", "Chapters", "Related", "Transcript"]);
    expect(screen.getAllByTestId("related-panel")).toHaveLength(1);
  });

  it("raises the sheet to half, not straight to full", async () => {
    await renderMediaAwaitingChrome();
    expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("inspector-toggle"));

    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    expect(sheet.dataset.snap).toBe("half");
    expect(sheet.dataset.snap).not.toBe("full");
  });

  it("does not rebuild the player when the sheet goes up and comes back", async () => {
    await renderMediaAwaitingChrome();
    const player = screen.getByTestId("file-preview");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.getByTestId("file-preview")).toBe(player);

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-peek");
    expect(screen.getByTestId("file-preview")).toBe(player);
  });

  it("publishes where the sheet is, for the player to read in CSS", async () => {
    await renderMediaAwaitingChrome();
    const shell = screen.getByTestId("file-detail-shell");
    expect(shell.dataset.sheetSnap).toBe("peek");

    fireEvent.click(screen.getByTestId("inspector-toggle"));

    await waitFor(() => {
      expect(
        screen.getByTestId("file-detail-shell").dataset.sheetSnap,
      ).toBe("expanded");
    });
  });

  it("keeps the same player element across every sheet transition", async () => {
    await renderMediaAwaitingChrome();
    const player = screen.getByTestId("file-preview");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.getByTestId("file-preview")).toBe(player);

    fireEvent.keyDown(document, { key: "Escape" });
    await screen.findByTestId("mobile-inspector-peek");
    expect(screen.getByTestId("file-preview")).toBe(player);
  });

  it("puts the scroller inside the part of the drawer that is on screen", async () => {
    await renderMediaAwaitingChrome();
    fireEvent.click(screen.getByTestId("inspector-toggle"));

    const visible = await screen.findByTestId("mobile-inspector-visible");
    expect(visible.style.height).toBe(SHEET_VISIBLE_HEIGHT);
    expect(SHEET_VISIBLE_HEIGHT).toContain("--snap-point-height");

    const scroller = screen.getByTestId("mobile-inspector-content");
    expect(visible).toContainElement(scroller);
    expect(scroller.style.maxHeight).toBe("");
  });

  it("gives the sheet one scroller, and the inspector inside it is not a second", async () => {
    withTranscript();
    await renderMediaAwaitingChrome();
    fireEvent.click(screen.getByTestId("inspector-toggle"));

    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.getByTestId("inspector-shell").dataset.scroll).toBe("column");

    const scrollers = [...sheet.querySelectorAll<HTMLElement>("*")].filter(
      (el) =>
        [...el.classList].some((token) =>
          /^overflow(-y)?-(auto|scroll)$/.test(token),
        ),
    );
    expect(scrollers).toEqual([screen.getByTestId("mobile-inspector-content")]);
  });

  it("keeps the tab strip reachable by pinning it to that one scroller", async () => {
    withTranscript();
    await renderMediaAwaitingChrome();
    fireEvent.click(screen.getByTestId("inspector-toggle"));

    await screen.findByTestId("mobile-inspector-sheet");
    const strip = screen.getByTestId("inspector-tabs");
    expect(strip.className).toContain("sticky");
    expect(strip.className).toContain("top-0");
    expect(strip.className).toContain("bg-bg-card");
  });

  it("puts it in the sheet, with its tabs", async () => {
    withTranscript();
    await renderMediaAwaitingChrome();

    fireEvent.click(screen.getByTestId("inspector-toggle"));

    await screen.findByTestId("mobile-inspector-sheet");
    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
    expect(screen.getAllByTestId("slot-entry-transcript")).toHaveLength(1);
  });

  it("hands the heavy summaries to the sheet and not also to the canvas", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");

    expect(screen.getAllByTestId("active-summary-host")).toHaveLength(1);
    expect(
      screen.getAllByTestId("addon-slot-include:detailed-summary"),
    ).toHaveLength(1);
    expect(screen.getByTestId("mobile-inspector-sheet")).toContainElement(
      screen.getByTestId("active-summary-host"),
    );
  });
});

/**
 * The snap is written out rather than recomputed: calling
 * `halfSnapUnderPlayer` here would pass against any derivation, including
 * one that ignored the player.
 */
describe("the sheet's half, derived from the player", () => {
  const VIEWPORT_HEIGHT = 768;
  const PLAYER_BOTTOM = 315;
  /** `1 − (0.9 × 768 − (768 − 315)) / 768`, by hand. */
  const DERIVED = 0.689844;

  let restore: (() => void) | null = null;
  let playerBottom = PLAYER_BOTTOM;

  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    setViewport(400);
    setViewportHeight(VIEWPORT_HEIGHT);
    playerBottom = PLAYER_BOTTOM;
    expect(window.innerHeight).toBe(VIEWPORT_HEIGHT);
  });

  afterEach(() => {
    restore?.();
    restore = null;
    setViewportHeight(VIEWPORT_HEIGHT);
  });

  /**
   * The wrapper rather than the frame inside it: the wrapper is what sticks
   * to the top of the canvas and has to stay clear of the sheet.
   */
  function stubPlayerBox(bottom: number) {
    playerBottom = bottom;
    if (restore) return;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("media-detail-player")) {
        return {
          ...new DOMRect(0, playerBottom - 211, 400, 211),
          bottom: playerBottom,
        } as DOMRect;
      }
      return original.call(this);
    };
    restore = () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  /**
   * Divided by the window *as it is now*, not by the height the suite
   * started at: the cases below move `innerHeight`.
   */
  const publishedSnap = (drawer: HTMLElement) =>
    1 -
    Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")) /
      window.innerHeight;

  function setViewportHeight(height: number) {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: height,
    });
  }

  const URL_BAR_PX = 80;

  /**
   * Read entirely off values the component wrote at its last render:
   * `publishedSnap` divides by the window *now*, so comparing two of those
   * would pass against a component that ignored a viewport change.
   */
  const roomOnScreen = (drawer: HTMLElement) =>
    Number.parseFloat(drawer.style.height) -
    Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height"));

  /**
   * Cases fire only the instances that observed the player, not every
   * constructed callback: more than one hook on this page builds an
   * observer, so firing them all re-derives the snap whether or not
   * anything was observed.
   */
  interface Instance {
    cb: ResizeObserverCallback;
    nodes: Element[];
    disconnected: boolean;
  }

  function stubResizeObserver(): {
    instances: Instance[];
    restore: () => void;
  } {
    const instances: Instance[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private instance: Instance;
      constructor(cb: ResizeObserverCallback) {
        this.instance = { cb, nodes: [], disconnected: false };
        instances.push(this.instance);
      }
      observe(node: Element) {
        this.instance.nodes.push(node);
      }
      unobserve() {}
      disconnect() {
        this.instance.disconnected = true;
      }
    } as unknown as typeof ResizeObserver;
    return {
      instances,
      restore: () => {
        globalThis.ResizeObserver = original;
      },
    };
  }

  const watching = (instances: Instance[], player: Element) =>
    instances.filter((i) => i.nodes.includes(player));

  function stubVisualViewport(): { target: EventTarget; restore: () => void } {
    const target = new EventTarget();
    const had = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: target,
    });
    return {
      target,
      restore: () => {
        if (had) Object.defineProperty(window, "visualViewport", had);
        else delete (window as { visualViewport?: unknown }).visualViewport;
      },
    };
  }

  async function openSheet() {
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    return screen.findByTestId("mobile-inspector-sheet");
  }

  it("raises the sheet to the room under the player", async () => {
    stubPlayerBox(PLAYER_BOTTOM);
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));

    const drawer = await openSheet();
    expect(drawer.dataset.snap).toBe("half");
    expect(publishedSnap(drawer)).toBeCloseTo(DERIVED, 5);
  });

  it("moves with the player, not with the window", async () => {
    stubPlayerBox(PLAYER_BOTTOM);
    const first = await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false }),
    );
    const shortPlayer = publishedSnap(await openSheet());
    first.unmount();
    restore?.();

    stubPlayerBox(PLAYER_BOTTOM * 2);
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    const tallPlayer = publishedSnap(await openSheet());

    expect(tallPlayer).toBeLessThan(shortPlayer);
  });

  it("falls back to the fixed fraction with no player measured", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));

    const drawer = await openSheet();
    expect(publishedSnap(drawer)).toBeCloseTo(SHEET_SNAP_HALF_FALLBACK, 5);
  });

  const VIEWPORT_CHANNELS = [
    {
      what: "a window resize",
      fire: (_: EventTarget) => window.dispatchEvent(new Event("resize")),
      dispatches: "window:resize",
    },
    {
      what: "a rotation",
      fire: (_: EventTarget) => window.dispatchEvent(new Event("orientationchange")),
      dispatches: "window:orientationchange",
    },
    {
      what: "the visual viewport",
      fire: (target: EventTarget) => target.dispatchEvent(new Event("resize")),
      dispatches: "visualViewport:resize",
    },
  ] as const;
  expect(VIEWPORT_CHANNELS).toHaveLength(3);
  expect(new Set(VIEWPORT_CHANNELS.map((c) => c.dispatches)).size).toBe(3);

  /**
   * Listening rather than wrapping `fire`: a listener sees the event
   * whatever route it arrived by, where a wrapper only sees calls that
   * went through the wrapper.
   */
  function recordDispatches(vvTarget: EventTarget): {
    signatures: string[];
    restore: () => void;
  } {
    const signatures: string[] = [];
    const types = [
      ...new Set(VIEWPORT_CHANNELS.map((c) => c.dispatches.split(":")[1])),
    ];
    const targets: [string, EventTarget][] = [
      ["window", window],
      ["visualViewport", vvTarget],
    ];
    const listeners = targets.flatMap(([name, target]) =>
      types.map((type) => {
        const listener = () => signatures.push(`${name}:${type}`);
        target.addEventListener(type, listener);
        return () => target.removeEventListener(type, listener);
      }),
    );
    return {
      signatures,
      restore: () => {
        for (const off of listeners) off();
      },
    };
  }

  const CHANNEL_GROUPS = [
    "re-derives when the window reports a taller viewport",
    "keeps the player element",
  ] as const;
  expect(CHANNEL_GROUPS).toHaveLength(2);

  const registeredChannelCases: string[] = [];

  const channelCaseId = (group: string, what: string) =>
    `${group}, through ${what}`;

  function eachChannel(
    group: string,
    body: (
      channel: (typeof VIEWPORT_CHANNELS)[number],
      vvTarget: EventTarget,
    ) => Promise<void>,
  ): void {
    for (const channel of VIEWPORT_CHANNELS) {
      it(channelCaseId(group, channel.what), async () => {
        // The stub and the recorder belong to the helper, not to the
        // body: the listener has to be on the visual viewport before
        // anything renders.
        const vv = stubVisualViewport();
        const seen = recordDispatches(vv.target);
        try {
          await body(channel, vv.target);
        } finally {
          seen.restore();
          vv.restore();
        }
        expect(seen.signatures).toEqual([channel.dispatches]);
      });
      registeredChannelCases.push(channelCaseId(group, channel.what));
    }
  }

  const RESIZE_OBSERVER_CASES = [
    "re-derives when the player's own box changes",
    "keeps the player element when the player's own box changes",
  ] as const;
  expect(RESIZE_OBSERVER_CASES).toHaveLength(2);

  const registeredResizeObserverCases: string[] = [];

  function resizeObserverCase(name: string, body: () => Promise<void>): void {
    it(name, body);
    registeredResizeObserverCases.push(name);
  }

  eachChannel(CHANNEL_GROUPS[0], async (channel, vvTarget) => {
    stubPlayerBox(PLAYER_BOTTOM);
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    const drawer = await openSheet();
    const before = roomOnScreen(drawer);
    expect(before).toBeCloseTo(VIEWPORT_HEIGHT - PLAYER_BOTTOM, 0);

    setViewportHeight(VIEWPORT_HEIGHT + URL_BAR_PX);
    act(() => {
      channel.fire(vvTarget);
    });

    await waitFor(() => {
      expect(
        roomOnScreen(screen.getByTestId("mobile-inspector-sheet")),
      ).toBeCloseTo(window.innerHeight - PLAYER_BOTTOM, 0);
    });
    expect(
      roomOnScreen(screen.getByTestId("mobile-inspector-sheet")),
    ).toBeGreaterThan(before);
  });

  resizeObserverCase(RESIZE_OBSERVER_CASES[0], async () => {
    const ro = stubResizeObserver();
    try {
      stubPlayerBox(PLAYER_BOTTOM);
      const { container } = await renderMediaAwaitingChrome(
        makeFile({ has_chapters: false }),
      );
      const before = publishedSnap(await openSheet());

      const player = container.querySelector(".media-detail-player")!;
      const watchingThePlayer = watching(ro.instances, player);
      // Two hooks observe this wrapper and `watching` counts released
      // instances too, so the number is a property of this page.
      expect(watchingThePlayer.length).toBe(3);

      stubPlayerBox(PLAYER_BOTTOM * 1.5);
      act(() => {
        for (const { cb } of watchingThePlayer) cb([], {} as ResizeObserver);
      });

      await waitFor(() => {
        expect(
          publishedSnap(screen.getByTestId("mobile-inspector-sheet")),
        ).toBeLessThan(before);
      });
    } finally {
      ro.restore();
    }
  });

  it("lets the old observer go when it takes a new one", async () => {
    const ro = stubResizeObserver();
    try {
      stubPlayerBox(PLAYER_BOTTOM);
      const { container, unmount } = await renderMediaAwaitingChrome(
        makeFile({ has_chapters: false }),
      );
      await openSheet();

      const player = container.querySelector(".media-detail-player")!;
      // Counted live, not by instance: more than one hook on this page
      // observes this wrapper.
      const live = () =>
        watching(ro.instances, player).filter((i) => !i.disconnected).length;
      const built = () => watching(ro.instances, player).length;
      const liveAtRest = live();
      // Of the three instances pointed at this wrapper, one has already
      // been released by the effect that built it re-running.
      expect(liveAtRest).toBe(2);

      const builtAtRest = built();
      setViewportHeight(VIEWPORT_HEIGHT + URL_BAR_PX);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      await waitFor(() => {
        expect(built()).toBeGreaterThan(builtAtRest);
      });
      expect(live()).toBe(liveAtRest);

      unmount();
      expect(live()).toBe(0);
    } finally {
      ro.restore();
    }
  });

  it("re-measures for the next file, by being built again with it", async () => {
    stubPlayerBox(PLAYER_BOTTOM);
    setApiResponses(makeFile({ has_chapters: false }));
    const { container, rerender } = render(
      <FileDetailContent fileId="f1" drive="main" />,
    );
    await screen.findByTestId("file-detail-chrome");
    const before = publishedSnap(await openSheet());
    const wrapper = container.querySelector(".media-detail-player")!;

    stubPlayerBox(PLAYER_BOTTOM * 1.5);
    setApiResponses(makeFile({ id: "f2", has_chapters: false }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await screen.findByTestId("file-detail-chrome");

    expect(container.querySelector(".media-detail-player")).not.toBe(wrapper);
    const after = publishedSnap(await openSheet());
    expect(after).toBeLessThan(before);
  });

  eachChannel(CHANNEL_GROUPS[1], async (channel, vvTarget) => {
    stubPlayerBox(PLAYER_BOTTOM);
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    const player = screen.getByTestId("file-preview");

    await openSheet();
    expect(screen.getByTestId("file-preview")).toBe(player);

    setViewportHeight(window.innerHeight + 1);
    act(() => {
      channel.fire(vvTarget);
    });
    expect(screen.getByTestId("file-preview")).toBe(player);
  });

  resizeObserverCase(RESIZE_OBSERVER_CASES[1], async () => {
    const ro = stubResizeObserver();
    try {
      stubPlayerBox(PLAYER_BOTTOM);
      const { container } = await renderMediaAwaitingChrome(
        makeFile({ has_chapters: false }),
      );
      const player = screen.getByTestId("file-preview");
      const wrapper = container.querySelector(".media-detail-player")!;
      await openSheet();

      const watchers = watching(ro.instances, wrapper);
      expect(watchers.length).toBe(3);

      stubPlayerBox(PLAYER_BOTTOM * 1.2);
      act(() => {
        for (const { cb } of watchers) cb([], {} as ResizeObserver);
      });
      expect(screen.getByTestId("file-preview")).toBe(player);
    } finally {
      ro.restore();
    }
  });

  it("registered every channel, in every group that walks them", () => {
    expect(registeredChannelCases).toEqual(
      CHANNEL_GROUPS.flatMap((group) =>
        VIEWPORT_CHANNELS.map((c) => channelCaseId(group, c.what)),
      ),
    );
    expect(registeredResizeObserverCases).toEqual([...RESIZE_OBSERVER_CASES]);
  });
});

describe("the layout fixture's page, against the shell", () => {
  const FIXTURE_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../e2e-layout/fixtures/mobile-inspector-sheet.html",
  );

  const SPEC: Record<string, string | number> = JSON.parse(
    readFileSync(FIXTURE_PATH, "utf-8").match(
      /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
    )![1],
  );

  const sorted = (className: string) =>
    className.split(/\s+/).filter(Boolean).sort();

  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    setViewport(400);
  });

  it("declares the five boxes the derived snap is measured against", async () => {
    const { container } = await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false }),
    );

    const shell = screen.getByTestId("file-detail-shell");
    const chrome = screen.getByTestId("file-detail-chrome");
    const canvas = container.querySelector("main")!;
    const mediaHost = container.querySelector(".media-detail-host")!;
    const player = container.querySelector(".media-detail-player")!;

    expect(sorted(shell.className)).toEqual(sorted(SPEC.pageRoot as string));
    expect(sorted(chrome.className)).toEqual(sorted(SPEC.chrome as string));
    expect(sorted(canvas.className)).toEqual(sorted(SPEC.canvas as string));
    expect(sorted(mediaHost.className)).toEqual(
      sorted(SPEC.mediaHost as string),
    );
    expect(sorted(player.className)).toEqual(sorted(SPEC.player as string));

    // `parentElement`, not `toContainElement`: `position: sticky` travels
    // only inside its own containing block, so a wrapper inserted between
    // the host and the player takes the pinning away.
    expect(canvas).toContainElement(mediaHost as HTMLElement);
    expect(player.parentElement).toBe(mediaHost);
  });

  it("declares the ratio a framed player's height comes from", async () => {
    const { container } = await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false }),
    );
    expect(
      container
        .querySelector(".media-detail-player")!
        .getAttribute("data-framed"),
    ).toBe("true");
    expect(
      Number.parseFloat(SPEC.framedShimPaddingTop as string) / 100,
    ).toBeCloseTo(9 / 16, 6);
  });

  it("declares the attribute that makes the player sticky at all", async () => {
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));
    expect(screen.getByTestId("file-detail-shell").dataset.sheetSnap).toBe(
      "peek",
    );
  });

  it("declares the padding that ends the page above the resting strip", async () => {
    const { container } = await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false }),
    );
    expect(
      container.querySelector("main")!.getAttribute("style"),
    ).toMatch(/padding-bottom:\s*calc\(56px \+ env\(/);
    expect(SPEC.peekHeight).toBe(SHEET_PEEK_HEIGHT);
  });
});

describe("what the canvas keeps and what the inspector takes", () => {
  it("shows the description in the canvas, not the inspector", async () => {
    const { container } = await renderMedia(
      makeFile({ has_chapters: false, description: "Recorded on location." }),
    );

    const description = screen.getByText("Recorded on location.");
    expect(container.querySelector("main")).toContainElement(description);
    expect(screen.getByTestId("inspector-pane")).not.toContainElement(
      description,
    );
  });

  it("keeps an addon section the canvas does not draw", async () => {
    await renderMedia(makeFile({ has_chapters: false }));

    const inspectorSlot = screen.getByTestId(
      "addon-slot-exclude:detailed-summary",
    );
    expect(screen.getByTestId("inspector-pane")).toContainElement(
      inspectorSlot,
    );
    expect(
      screen.queryByTestId("addon-slot-exclude:knowledge-edit,detailed-summary"),
    ).toBeNull();
  });

  it("pads itself by the amount the beside threshold budgets for", async () => {
    // Nothing derives the class from `CANVAS_PADDING_REM`, so the two are
    // kept in step here.
    const { container } = await renderMedia(makeFile({ has_chapters: false }));

    const canvas = container.querySelector(".media-detail-host");
    expect(canvas).not.toBeNull();
    expect(CANVAS_PADDING_REM).toBe(2);
    // 2rem across the pair, so 1rem a side: `p-4` on Tailwind's scale.
    expect(canvas!.classList.contains("p-4")).toBe(true);
  });

  it("keeps the desktop pane's header pinned, which is where the split earns its keep", async () => {
    await renderMedia();

    const shell = screen.getByTestId("inspector-shell");
    expect(screen.getByTestId("inspector-pane")).toContainElement(shell);
    expect(shell.dataset.scroll).toBe("panel");
  });

  it("publishes no sheet state on a desktop, so its rules cannot apply", async () => {
    await renderMedia(makeFile({ has_chapters: false }));

    expect(
      screen.getByTestId("file-detail-shell").dataset.sheetSnap,
    ).toBeUndefined();
  });

  it("keeps the action row in the inspector, where every kind has it", async () => {
    await renderMedia(makeFile({ has_chapters: false }));

    expect(screen.getByTestId("inspector-pane")).toContainElement(
      screen.getByTestId("file-actions"),
    );
  });

  it("measures the height budget against the shell's scroll container", async () => {
    // Two different heights, so the assertion can only be satisfied by
    // the right element.
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.tagName === "MAIN" ? 500 : 999;
      },
    );
    const hostRoot = document.createElement("section");
    setApiResponses(makeFile({ has_chapters: false }));
    const { container } = render(
      <FileDetailContent fileId="f1" drive="main" miniPlayerRoot={hostRoot} />,
    );
    await loaded();

    const host = container.querySelector<HTMLElement>(".media-detail-host");
    await waitFor(() => {
      expect(host?.style.getPropertyValue("--rail-avail")).toBe("500px");
    });
    expect(host?.style.getPropertyValue("--rail-top")).toBe("0px");
  });
});
