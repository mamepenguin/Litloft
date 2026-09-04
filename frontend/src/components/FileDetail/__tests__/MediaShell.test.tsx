/**
 * Media on `FileDetailShell` — the 2026-09 layout.
 *
 * The structural claim under test is that in the beside form the
 * companion region stops being a column of a CSS grid and becomes
 * inspector tabs, while in the below form it is a bounded box in the
 * canvas. What must hold across that is that its occupants are mounted
 * in exactly one of the two: the transcript fetches, follows the
 * playback clock and holds a scroll position, so a second copy is not a
 * duplicate render but a second, competing reader of the same file.
 *
 * The shell is left real here. Stubbing it is what let a second page
 * row ship once already, and every claim below is about what the shell
 * does with what it is handed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";
import { SHEET_PEEK_PX } from "@/components/MobileInspectorSheet";
import { CANVAS_PADDING_REM } from "@/lib/layoutSizes";
import {
  claimSlot,
  loaded,
  makeFile,
  setApiResponses,
  slotMocks,
  usePolicyMock,
  setViewport,
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
vi.mock("../../RelatedFilesSection", async () => ({
  RelatedFilesSection: (await import("./harness")).RelatedFilesSectionStub,
}));
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
 * Render and wait for the page row rather than the action row.
 *
 * `loaded()` waits for `file-actions`, which lives in the inspector —
 * so it never arrives where the inspector starts closed, whether that
 * is a phone's unopened sheet or a stored preference. The page row is
 * the first thing the shell commits, and the toggle beside it is gated
 * on the same resolved file, so nothing asserted after this is still
 * pending.
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

    // Exactly three, not "at least three": the point of the strip is
    // that it says what is there, so an extra tab nobody named is the
    // failure this is watching for.
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
    // The canvas box is the other home. It must be empty, not merely
    // hidden — a second transcript would fetch and follow the clock.
    expect(container.querySelector(".media-detail-below")).toBeNull();
  });

  it("gives every tab the touch floor, on the row", async () => {
    // `DESIGN.md` §Row Actions: 44px under `pointer: coarse`, reached on
    // the row so its members inherit it. `classList` rather than a
    // substring test — `pointer-coarse:min-h-11` contains `min-h-11`,
    // so `toContain` would pass on the conditional class alone.
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

  it("draws the addon's derived relations in the Info tab", async () => {
    // The primary home of `file-relations`, and the point of the move
    // this phase asked an addon to make: an entry that left
    // `file-detail-sections` is reachable only through this slot, so a
    // layout that stopped mounting it would take the section off every
    // canonical file detail page — on every kind — and say nothing.
    withTranscript();
    claimSlot("file-relations", [
      { id: "derived", label: "Derived", priority: 10, addonName: "some-addon" },
    ]);
    await renderMedia();

    expect(screen.getByTestId("addon-slot-file-relations")).toBeInTheDocument();
    expect(screen.getByTestId("related-files")).toBeInTheDocument();
  });

  it("keeps the beside/below toggle off a phone", async () => {
    // `onBeside` opens the desktop pane's bit; a phone's sheet is the
    // shell's own state and has nothing to do with that store. Drawn
    // there, the control would write a preference and open nothing.
    withTranscript();
    setViewport(400);
    await renderMediaAwaitingChrome();

    expect(layoutToggle()).toBeNull();
  });

  it("tells the occupant its name is already on the button", async () => {
    // The tab button carries the label, so a panel that draws its own
    // heading spends a line repeating what the reader just pressed.
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
    // The symptom this fixes: a video nobody has transcribed grows a
    // Transcript tab that opens on an empty panel. Core cannot look
    // inside the panel to find that out — asking by name is the
    // dependency the rules forbid — so the entry says so itself.
    withTranscript();
    await renderMedia();
    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
    const before = screen.getByTestId("slot-entry-transcript");

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(tabs()).toEqual(["Info", "Chapters"]);
    // Still the same node. It is the thing doing the reporting: unmount
    // it and its first answer becomes its last.
    expect(screen.getByTestId("slot-entry-transcript")).toBe(before);
  });

  it("gets the tab back the moment it has something", async () => {
    // A transcript that is still fetching answers "nothing" first. If
    // the first answer were final, every slow fetch would cost the
    // reader the tab for the rest of the file.
    withTranscript();
    await renderMedia();
    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));
    expect(tabs()).toEqual(["Info", "Chapters"]);

    fireEvent.click(screen.getByTestId("slot-entry-transcript-filled"));

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });

  it("takes the layout toggle with it when it is the only occupant", async () => {
    // The toggle moves the companion between two places. With nothing
    // in it, both are empty and pressing it changes nothing a reader
    // can see — the row that only says a feature exists.
    withTranscript();
    await renderMedia(makeFile({ has_chapters: false }));
    expect(layoutToggle()).not.toBeNull();

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(layoutToggle()).toBeNull();
  });

  it("leaves the toggle alone while core still fills the region", async () => {
    // Chapters are core's own occupant, and an addon having nothing
    // says nothing about them.
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

    // A different file, so the previous file's "nothing" says nothing.
    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
  });
});

describe("an occupant with nothing for this file, below", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
  });

  it("hides the box without unmounting what is in it", async () => {
    // The below form has no button to take away, so the box is hidden
    // in CSS instead. Dropping it from the tree would drop the reporter
    // — and in the below form the reporter is the only one there is, so
    // the answer could never change back.
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
    // The tab path sorts inside the composer; this path does not go
    // through it. `getSlotEntries` hands back the catalogue's raw order
    // and `AddonSlot` — which sorts — is no longer in this path, so
    // building the nodes by hand drops the ordering unless it is redone
    // here. Declared out of order on purpose: with them already sorted
    // an unsorted build would be indistinguishable from a sorted one.
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
    // There is no heading over the box, so an occupant told otherwise
    // would draw nothing to say what it is.
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
    // With the occupants gone from the strip the inspector is back to
    // the single-tab shape a note has always had.
    expect(tabs()).toEqual([]);
  });

  it("still mounts each occupant exactly once", async () => {
    withTranscript();
    const { container } = await renderMedia();

    // One node per entry here as well: the availability callback is per
    // entry, so the canvas builds them one at a time rather than handing
    // one props object to the whole slot. It is still the same occupant,
    // and there is still one of it — in the canvas and not in a tab.
    const entries = screen.getAllByTestId("slot-entry-transcript");
    expect(entries).toHaveLength(1);
    expect(container.querySelector(".media-detail-below-body")).toContainElement(
      entries[0],
    );
    expect(tabs()).toEqual([]);
    expect(screen.getAllByTestId("chapters-panel")).toHaveLength(1);
  });

  it("draws no box at all when nothing would go in it", async () => {
    // Below, desktop, a video with neither chapters nor an addon: an
    // empty box would still take its own margin, and the toggle is
    // hidden in that state, so the reader could not get out of it.
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
    // The player is not what moves, and it must not be rebuilt as if it
    // were: a fresh <video> starts at zero, and the `ended` handler that
    // writes the final position is re-bound to a player that never
    // played. `.claude/rules/design-decisions.md`, watch history.
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
    // Beside means an inspector tab, so pressing it with the inspector
    // closed moves the panel somewhere the reader cannot see and says
    // nothing. Going the other way must not open it: below is in the
    // canvas, which is already on screen.
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
    // Below is the stored preference, and a phone has no beside to
    // honour it against: the inspector is a sheet, so the occupants go
    // there and the page keeps one scroll. A canvas box on top of that
    // is the nested scroller MB-1 is about — the one where the page
    // stops moving the moment a finger lands on the transcript.
    window.localStorage.setItem("media-layout-preference", "stacked");
    setViewport(400);
  });

  it("keeps the companion out of the canvas whatever the preference says", async () => {
    withTranscript();
    const { container } = await renderMediaAwaitingChrome();

    expect(container.querySelector(".media-detail-below")).toBeNull();
  });

  it("rests at the peek row, with the file's name and its actions", async () => {
    // The point of the strip: on a phone the per-file controls used to
    // be somewhere in a column the reader had to find. Exactly one
    // action row on the page — the inspector's copy is hoisted away,
    // because two would be two `⋮` menus over one file.
    await renderMediaAwaitingChrome(
      makeFile({ has_chapters: false, title: "Sample" }),
    );

    const peek = await screen.findByTestId("mobile-inspector-peek");
    expect(peek).toHaveTextContent("Sample");
    expect(peek).toContainElement(screen.getByTestId("file-action-row"));
    // One on screen. The inspector draws its own, but only while the
    // sheet is up — and the strip is gone then, so the two are
    // mutually exclusive returns rather than a gate someone has to
    // keep in step.
    expect(screen.getAllByTestId("file-action-row")).toHaveLength(1);
  });

  it("carries only the four controls the strip is specified as", async () => {
    // 題名 ＋ ♡ ☆ AI ▾ ⋮. The state chip belongs to the inspector's
    // fixed part, and Cast and the gallery launcher to the file's own
    // row — lifting them here is what took the strip past 375px with
    // the title at zero width. The sizing rules say reduce the number
    // of controls before stripping labels, and this is that reduction;
    // the labels come off afterwards because the row shares a line with
    // the name.
    await renderMediaAwaitingChrome(makeFile({ has_chapters: false }));

    const peek = await screen.findByTestId("mobile-inspector-peek");
    expect(peek.querySelector("[data-testid='trust-tier-state']")).toBeNull();
    expect(peek).not.toHaveTextContent(/Unverified|未検証/);
    // The floor is reached by the controls, not by the row: a tall row
    // with `items-center` leaves 28px targets inside it. The rule that
    // grows them is CSS — jsdom does no layout — so this pins the hook
    // the rule selects on and `mediaDetailTheaterCss` pins the rule.
    const row = screen.getByTestId("file-action-row");
    expect(row.classList.contains("file-action-row-compact")).toBe(true);
  });

  it("ends the page above the strip it rests behind", async () => {
    // Without this the last thing in the canvas is permanently behind
    // the 56px row and cannot be scrolled to.
    const { container } = await renderMediaAwaitingChrome();
    const main = container.querySelector("main");
    expect(main?.style.paddingBottom).toBe(`${SHEET_PEEK_PX}px`);
  });

  it("raises the sheet to half, not straight to full", async () => {
    // Half keeps the player on screen, which is the reason the design
    // asks for three states rather than two. Asserted as *which*
    // expanded state: a test that only says "expanded" passes for full
    // as well, and full is the one that covers the player.
    await renderMediaAwaitingChrome();
    expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("inspector-toggle"));

    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    expect(sheet.dataset.snap).toBe("half");
    expect(sheet.dataset.snap).not.toBe("full");
  });

  it("does not rebuild the player when the sheet goes up and comes back", async () => {
    // The test §4.4 asks for before anything near the player is
    // touched. A remounted `<video>` restarts at zero and rebinds
    // `ended`, and a re-parented `.loft` iframe reloads outright — the
    // browser's rule, not React's. The sheet must move without either.
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
    // The player is never handed the sheet's state. It is published on
    // the shell root and a stylesheet acts on it, because handing it
    // down means re-rendering the player, and re-rendering is what
    // reloads a `.loft` iframe and restarts a `<video>` at zero.
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
    // The guard §4.4 asks for, at each hop: a re-parented iframe
    // reloads (the browser's rule, not React's) and a remounted
    // `<video>` restarts at zero with `ended` rebound, which is how a
    // completion path comes to write a position nobody played. Element
    // identity is the proxy — jsdom has no `currentTime` to survive.
    await renderMediaAwaitingChrome();
    const player = screen.getByTestId("file-preview");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.getByTestId("file-preview")).toBe(player);

    fireEvent.keyDown(document, { key: "Escape" });
    await screen.findByTestId("mobile-inspector-peek");
    expect(screen.getByTestId("file-preview")).toBe(player);
  });

  it("bounds the sheet's scroller by the state it is in", async () => {
    // vaul keeps the content at full height and slides it, so at half
    // the bottom of the scroll box is below the screen and cannot be
    // scrolled to.
    await renderMediaAwaitingChrome();
    fireEvent.click(screen.getByTestId("inspector-toggle"));

    const scroller = await screen.findByTestId("mobile-inspector-content");
    expect(scroller.style.maxHeight).toBe("50vh");
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
    // The sheet takes them on a phone because a 90vh drawer at viewport
    // width has room for a markdown table. Drawing them in the canvas as
    // well mounts `ActiveSummaryHost` twice — two fetches for one file,
    // and two of whatever the detailed-summary section fetches.
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
    // The inspector excludes what the canvas took. The document canvas
    // takes `knowledge-edit` — the note editor — and the media canvas
    // does not, so excluding it on both left a video with the knowledge
    // addon's "create a note" card in neither column.
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
    // `CANVAS_PADDING_REM` is a term in the width at which the
    // inspector stops sitting beside the canvas, and it is there
    // because the player is *inside* this padding. Nothing derives the
    // class from the constant, so this is the seam: widening the
    // padding without widening the term silently takes the difference
    // back out of the player.
    const { container } = await renderMedia(makeFile({ has_chapters: false }));

    const canvas = container.querySelector(".media-detail-host");
    expect(canvas).not.toBeNull();
    expect(CANVAS_PADDING_REM).toBe(2);
    // 2rem across the pair, so 1rem a side: `p-4` on Tailwind's scale.
    expect(canvas!.classList.contains("p-4")).toBe(true);
  });

  it("publishes no sheet state on a desktop, so its rules cannot apply", async () => {
    // The attribute's presence is the mobile test the stylesheet makes.
    // Published unconditionally, a desktop player would go sticky and
    // lose its height budget with nothing on screen explaining why.
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
    // Not the host's wrapper: on the shell that wrapper never scrolls,
    // so measuring it would report the height of the whole document.
    // `--rail-top: 0px` is the tell — it is only zero when the metrics
    // were given a pane rather than falling back to the window.
    // Two different heights, so the assertion can only be satisfied by
    // the right element. One height for both would pass whichever of
    // the two was measured, which is the question.
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
