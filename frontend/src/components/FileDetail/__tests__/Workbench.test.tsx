/**
 * The workbench under the player on the canonical file page: the toggle row,
 * the panel cards, the remembered list, and the tabs the narrow forms use
 * instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import {
  claimSlot,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
  slotMocks,
  usePolicyMock,
  withRelations,
} from "./harness";
import {
  ASK,
  LATE,
  NARROW_ROW,
  SCENES,
  STORE_KEY,
  TRANSCRIPT,
  WIDE_ROW,
  drawnSectionIds,
  entryNode,
  fit,
  follows,
  installRow,
  isHidden,
  panelCard,
  panelGroup,
  propsOf,
  resizeRowTo,
  selectedTab,
  shownPanels,
  storeOpen,
  storePanels,
  storedPanels,
  tabs,
  toggle,
  toggleLabels,
} from "./workbenchHelpers";

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
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
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

const DESCRIPTION = "Recorded on location.";
const VIDEO = makeFile({ has_chapters: true, description: DESCRIPTION });
const IMAGE = makeFile({
  filename: "photo.jpg",
  file_type: "image",
  mime_type: "image/jpeg",
  duration: null,
  has_chapters: false,
  description: DESCRIPTION,
});

beforeEach(() => {
  vi.clearAllMocks();
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A desktop window whose row holds the inspector beside the canvas. */
function wide({ open = true } = {}) {
  setViewport(1400);
  installRow(WIDE_ROW);
  storeOpen(open);
}

/** A tablet whose row is too narrow for the inspector beside the player. */
function stacked({ open = true } = {}) {
  setViewport(1024);
  installRow(NARROW_ROW);
  storeOpen(open);
}

function phone() {
  setViewport(400);
  installRow(360);
}

async function renderFile(file: FileItem = VIDEO, { measured = true } = {}) {
  setApiResponses(file);
  const utils = render(<FileDetailContent fileId={file.id} drive="main" />);
  await shellLoaded();
  if (measured) await waitFor(() => expect(fit()).not.toBeUndefined());
  return utils;
}

async function raiseSheet() {
  fireEvent.click(screen.getByTestId("inspector-toggle"));
  return screen.findByTestId("mobile-inspector-sheet");
}

function press(label: string) {
  fireEvent.click(toggle(label));
}

describe("SPEC-CORE-085 the toggle row under the player", () => {
  it("SPEC-CORE-085 I1 lists one toggle per available panel, in priority order, with none for chapters", async () => {
    wide();
    // Declared out of priority order, so a row that kept the catalogue's order would differ.
    claimSlot("player-side", [LATE, TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);

    expect(toggleLabels()).toEqual(["Transcript", "Scenes", "Late"]);
    for (const label of ["Transcript", "Scenes", "Late"]) {
      expect(toggle(label)).toHaveAttribute("aria-pressed", "false");
    }
    expect(toggleLabels()).not.toContain("Chapters");
    expect(screen.getAllByTestId("chapters-panel")).toHaveLength(1);
    expect(tabs()).toContain("Chapters");
  });

  it("SPEC-CORE-085 I1 draws the row after the player and outside the inspector", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);

    const group = panelGroup()!;
    expect(group).not.toBeNull();
    expect(follows(screen.getByTestId("file-preview"), group)).toBe(true);
    expect(screen.getByTestId("inspector-pane")).not.toContainElement(group);
  });

  it("SPEC-CORE-085 I1 puts the player's file-preview-actions after the toggles in a wide form", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    claimSlot("file-preview-actions", [
      { id: "quote", label: "Quote", priority: 10, addonName: "other" },
    ]);
    await renderFile(VIDEO);

    const group = panelGroup()!;
    expect(group).not.toBeNull();
    const actions = screen.getByTestId("addon-slot-file-preview-actions");
    expect(follows(group, actions)).toBe(true);
    expect(follows(screen.getByTestId("file-preview"), actions)).toBe(true);
  });

  it("SPEC-CORE-085 I1 takes a panel's toggle away when its entry answers false, without unmounting it", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);
    expect(toggleLabels()).toEqual(["Transcript", "Scenes"]);
    const before = entryNode("scenes");

    fireEvent.click(screen.getByTestId("slot-entry-scenes-empty"));
    expect(toggleLabels()).toEqual(["Transcript"]);
    expect(entryNode("scenes")).toBe(before);

    fireEvent.click(screen.getByTestId("slot-entry-scenes-filled"));
    expect(toggleLabels()).toEqual(["Transcript", "Scenes"]);
  });

  it("SPEC-CORE-085 I1 draws no row once the only panel answers false", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(makeFile({ has_chapters: false }));
    expect(panelGroup()).not.toBeNull();

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));

    expect(panelGroup()).toBeNull();
  });

  it("SPEC-CORE-085 I1 draws the row with the inspector closed, in a non-phone form", async () => {
    wide({ open: false });
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);

    expect(screen.queryByTestId("inspector-pane")).toBeNull();
    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-085 draws no row, panel or panel tab before the row is measured, and the row in the first measured frame", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    installRow(0);
    await renderFile(VIDEO, { measured: false });

    expect(fit()).toBeUndefined();
    expect(panelGroup()).toBeNull();
    expect(screen.queryAllByTestId("slot-entry-transcript")).toHaveLength(0);
    expect(tabs()).not.toContain("Transcript");

    resizeRowTo(WIDE_ROW);

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
  });
});

describe("SPEC-CORE-085 turning panels on and off", () => {
  it("SPEC-CORE-085 I1 I2 turns a panel on with its toggle and off with the toggle or its close button", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);
    expect(shownPanels()).toEqual([]);

    press("Transcript");
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(storedPanels()).toEqual(["transcript"]);

    press("Transcript");
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");
    expect(shownPanels()).toEqual([]);
    expect(storedPanels()).toEqual([]);

    press("Transcript");
    fireEvent.click(screen.getByRole("button", { name: "Close Transcript" }));
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");
    expect(shownPanels()).toEqual([]);
    expect(storedPanels()).toEqual([]);
  });

  it("SPEC-CORE-085 draws each card as a section labelled by an h2 with the panel's label, holding the entry", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);

    press("Transcript");

    const card = panelCard("Transcript");
    const heading = card.querySelector("h2")!;
    expect(heading).toHaveTextContent("Transcript");
    expect(card.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(card).toContainElement(entryNode("transcript"));
  });

  it("SPEC-CORE-085 I2 draws the shown panels in priority order, not in the order they were turned on", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, LATE]);
    await renderFile(VIDEO);

    press("Late");
    press("Transcript");

    expect(storedPanels()).toEqual(["late", "transcript"]);
    expect(shownPanels()).toEqual(["Transcript", "Late"]);
  });

  it("SPEC-CORE-085 I2 keeps panels that are off mounted inside a hidden container, and draws no card for them", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);
    expect(toggleLabels()).toEqual(["Transcript", "Scenes"]);

    expect(shownPanels()).toEqual([]);
    expect(isHidden(entryNode("transcript"))).toBe(true);
    expect(isHidden(entryNode("scenes"))).toBe(true);
    expect(screen.getByTestId("inspector-pane")).not.toContainElement(
      entryNode("transcript"),
    );
  });

  it("SPEC-CORE-085 I4 never remounts a panel or the player while panels are turned on, off or closed", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);
    const player = screen.getByTestId("file-preview");
    const transcript = entryNode("transcript");
    const scenes = entryNode("scenes");

    press("Transcript");
    press("Scenes");
    press("Transcript");
    fireEvent.click(screen.getByRole("button", { name: "Close Scenes" }));
    press("Scenes");

    expect(screen.getByTestId("file-preview")).toBe(player);
    expect(entryNode("transcript")).toBe(transcript);
    expect(entryNode("scenes")).toBe(scenes);
  });
});

describe("SPEC-CORE-085 I3 two panels at most", () => {
  it("SPEC-CORE-085 I3 drops the earliest-turned-on panel when a third is turned on and all are shown", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES, LATE]);
    await renderFile(VIDEO);

    press("Late");
    press("Transcript");
    press("Scenes");

    expect(storedPanels()).toEqual(["transcript", "scenes"]);
    expect(toggle("Late")).toHaveAttribute("aria-pressed", "false");
    expect(shownPanels()).toEqual(["Transcript", "Scenes"]);
  });

  it("SPEC-CORE-085 I3 drops a stored id this file does not have before an earlier one it shows", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["transcript", "ghost"]);
    await renderFile(VIDEO);

    press("Scenes");

    expect(storedPanels()).toEqual(["transcript", "scenes"]);
    expect(shownPanels()).toEqual(["Transcript", "Scenes"]);
  });

  it("SPEC-CORE-085 I3 drops a stored panel that answered false on this file before an earlier one it shows", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES, LATE]);
    storePanels(["transcript", "scenes"]);
    await renderFile(VIDEO);
    fireEvent.click(screen.getByTestId("slot-entry-scenes-empty"));
    expect(shownPanels()).toEqual(["Transcript"]);

    press("Late");

    expect(storedPanels()).toEqual(["transcript", "late"]);
    expect(shownPanels()).toEqual(["Transcript", "Late"]);
  });
});

describe("SPEC-CORE-086 the remembered list", () => {
  it("SPEC-CORE-086 I3 starts with every panel off when nothing is stored", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");
    expect(shownPanels()).toEqual([]);
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
  });

  it("SPEC-CORE-086 shows the stored panels on the first measured frame", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["scenes"]);
    await renderFile(VIDEO);

    expect(toggle("Scenes")).toHaveAttribute("aria-pressed", "true");
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");
    expect(shownPanels()).toEqual(["Scenes"]);
  });

  it.each([
    ["an object", '{"0":"transcript"}'],
    ["a bare string", '"transcript"'],
    ["an array of numbers", "[1, 2]"],
    ["a mixed array", '["transcript", 3]'],
    ["text that is not JSON", "transcript"],
  ])(
    "SPEC-CORE-086 I3 reads %s as an empty list and overwrites it on the next toggle",
    async (_name, raw) => {
      wide();
      claimSlot("player-side", [TRANSCRIPT]);
      window.localStorage.setItem(STORE_KEY, raw);
      await renderFile(VIDEO);

      expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");
      expect(shownPanels()).toEqual([]);

      press("Transcript");
      expect(storedPanels()).toEqual(["transcript"]);
    },
  );

  it("SPEC-CORE-086 keeps a stored id this file does not have, and gives it no space", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["ghost"]);
    await renderFile(VIDEO);

    expect(shownPanels()).toEqual([]);
    press("Transcript");

    expect(storedPanels()).toEqual(["ghost", "transcript"]);
    expect(shownPanels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-086 follows a toggle made in another window of the browser", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");

    act(() => {
      window.localStorage.setItem(STORE_KEY, '["transcript"]');
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORE_KEY,
          oldValue: null,
          newValue: '["transcript"]',
          storageArea: window.localStorage,
        }),
      );
    });

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-086 works in memory when storage throws", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === STORE_KEY) throw new DOMException("denied", "SecurityError");
      return getItem.call(this, key);
    });
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === STORE_KEY) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    });
    await renderFile(VIDEO);
    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "false");

    press("Transcript");

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-086 I3 is written by nothing but a toggle or a close button", async () => {
    stacked();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["scenes"]);
    const { rerender } = await renderFile(VIDEO);
    expect(tabs()).toContain("Transcript");
    const writes = vi.spyOn(Storage.prototype, "setItem");

    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    resizeRowTo(WIDE_ROW);
    expect(toggleLabels()).toEqual(["Transcript", "Scenes"]);
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    resizeRowTo(NARROW_ROW);
    setApiResponses(makeFile({ id: "f2", has_chapters: true }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await waitFor(() => expect(fit()).not.toBeUndefined());

    expect(
      writes.mock.calls.filter(([key]) => key === STORE_KEY),
    ).toEqual([]);
    expect(storedPanels()).toEqual(["scenes"]);
  });

  it("SPEC-CORE-086 keeps the list across files and asks each file again for availability", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    const { rerender } = await renderFile(VIDEO);
    press("Transcript");
    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));
    expect(panelGroup()).toBeNull();

    setApiResponses(makeFile({ id: "f2", has_chapters: true }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await waitFor(() => expect(toggleLabels()).toEqual(["Transcript"]));

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(storedPanels()).toEqual(["transcript"]);
  });
});

describe("SPEC-CORE-087 the narrow forms", () => {
  it("SPEC-CORE-087 I6 makes every available panel a tab in the stacked inspector, between Chapters and Related", async () => {
    stacked();
    claimSlot("player-side", [LATE, TRANSCRIPT]);
    claimSlot("inspector-tabs", [ASK]);
    withRelations(1);
    await renderFile(VIDEO);
    fireEvent.click(screen.getByTestId("slot-entry-ask-filled"));

    expect(tabs()).toEqual([
      "Info",
      "Chapters",
      "Transcript",
      "Late",
      "Related",
      "Ask",
    ]);
    expect(panelGroup()).toBeNull();
    expect(shownPanels()).toEqual([]);
  });

  it("SPEC-CORE-087 I6 lists no panel as a tab in a wide form", async () => {
    wide();
    claimSlot("player-side", [LATE, TRANSCRIPT]);
    claimSlot("inspector-tabs", [ASK]);
    withRelations(1);
    await renderFile(VIDEO);
    fireEvent.click(screen.getByTestId("slot-entry-ask-filled"));

    expect(tabs()).toEqual(["Info", "Chapters", "Related", "Ask"]);
    expect(toggleLabels()).toEqual(["Transcript", "Late"]);
  });

  it("SPEC-CORE-087 I6 makes a panel a tab whether or not it is in the stored list, and labels it by host", async () => {
    stacked();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    withRelations(1);
    storePanels(["scenes"]);
    await renderFile(VIDEO);

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript", "Scenes", "Related"]);
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(propsOf("transcript").labelledByHost).toBe(true);
    expect(propsOf("scenes").labelledByHost).toBe(true);
    expect(storedPanels()).toEqual(["scenes"]);
  });

  it("SPEC-CORE-087 drops a panel's tab when its entry answers false", async () => {
    stacked();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    withRelations(1);
    await renderFile(VIDEO);
    expect(tabs()).toEqual(["Info", "Chapters", "Transcript", "Scenes", "Related"]);

    fireEvent.click(screen.getByTestId("slot-entry-scenes-empty"));

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript", "Related"]);
  });

  it("SPEC-CORE-087 moves the panels between the workbench and the tabs when a window drag crosses the threshold", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(VIDEO);
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(tabs()).not.toContain("Transcript");

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");
    expect(panelGroup()).toBeNull();
    expect(shownPanels()).toEqual([]);
    expect(tabs()).toContain("Transcript");
    expect(screen.getByTestId("inspector-pane")).toContainElement(
      entryNode("transcript"),
    );

    resizeRowTo(WIDE_ROW);
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(tabs()).not.toContain("Transcript");
    expect(storedPanels()).toEqual(["transcript"]);
  });

  it("SPEC-CORE-087 draws the panels under the player when the stacked inspector is closed, and tabs them when it opens", async () => {
    stacked({ open: false });
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(VIDEO);

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await screen.findByTestId("inspector-pane");

    expect(panelGroup()).toBeNull();
    expect(tabs()).toContain("Transcript");
  });

  it("SPEC-CORE-087 falls back to Info after a narrow, wide, narrow round trip", async () => {
    stacked();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO);
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(selectedTab()).toBe("Transcript");

    resizeRowTo(WIDE_ROW);
    expect(tabs()).not.toContain("Transcript");
    resizeRowTo(NARROW_ROW);

    expect(tabs()).toContain("Transcript");
    expect(selectedTab()).toBe("Info");
  });

  it("SPEC-CORE-087 I6 tabs the panels on the raised phone sheet and mounts none at rest", async () => {
    phone();
    claimSlot("player-side", [LATE, TRANSCRIPT]);
    withRelations(1);
    await renderFile(VIDEO, { measured: false });

    expect(screen.queryAllByTestId("slot-entry-transcript")).toHaveLength(0);
    expect(panelGroup()).toBeNull();

    await raiseSheet();

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript", "Late", "Related"]);
    expect(panelGroup()).toBeNull();
    expect(screen.getAllByTestId("slot-entry-transcript")).toHaveLength(1);
  });
});

describe("SPEC-CORE-089 the props a player-side entry receives", () => {
  it("SPEC-CORE-089 I8 hands a wide-form entry fillHeight, labelledByHost, onAvailability and active that follows whether it is shown", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);

    expect(propsOf("transcript")).toMatchObject({
      fillHeight: true,
      labelledByHost: true,
      active: false,
    });
    expect(typeof propsOf("transcript").onAvailability).toBe("function");

    press("Transcript");
    expect(propsOf("transcript").active).toBe(true);
    expect(propsOf("scenes").active).toBe(false);

    press("Transcript");
    expect(propsOf("transcript").active).toBe(false);
  });

  it("SPEC-CORE-089 I8 SPEC-CORE-087 I4 makes a tab's entry active only while its tab is selected in an open inspector, without remounting it", async () => {
    stacked();
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    await renderFile(VIDEO);
    const transcript = entryNode("transcript");
    const player = screen.getByTestId("file-preview");
    expect(selectedTab()).toBe("Info");
    expect(propsOf("transcript").active).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(propsOf("transcript").active).toBe(true);
    expect(propsOf("scenes").active).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    expect(propsOf("transcript").active).toBe(false);
    expect(propsOf("scenes").active).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    expect(propsOf("scenes").active).toBe(false);
    expect(entryNode("transcript")).toBe(transcript);
    expect(screen.getByTestId("file-preview")).toBe(player);
  });

  it("SPEC-CORE-089 I8 makes a phone tab's entry active only while the sheet is raised and its tab is selected", async () => {
    phone();
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(VIDEO, { measured: false });
    await raiseSheet();

    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(propsOf("transcript").active).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    expect(propsOf("transcript").active).toBe(false);
  });
});

describe("SPEC-CORE-089 I9 ids the core owns, and ids in two slots", () => {
  it("SPEC-CORE-089 I9 mounts no player-side entry whose id is a core panel or core tab id", async () => {
    wide();
    const colliding = ["info", "find", "pages", "chapters", "related", "active-summary"];
    claimSlot("player-side", [
      ...colliding.map((id, index) => ({
        id,
        label: `Addon ${id}`,
        priority: 11 + index,
        addonName: "other",
      })),
      TRANSCRIPT,
    ]);
    await renderFile(VIDEO);

    expect(toggleLabels()).toEqual(["Transcript"]);
    for (const id of colliding) {
      expect({ id, mounted: screen.queryAllByTestId(`slot-entry-${id}`).length }).toEqual({
        id,
        mounted: 0,
      });
    }
    expect(screen.getAllByTestId("chapters-panel")).toHaveLength(1);
  });

  it("SPEC-CORE-089 I9 draws an id in both player-side and file-detail-sections only as the panel on a player file", async () => {
    wide();
    const detailed = {
      id: "detailed-summary",
      label: "Detailed summary",
      priority: 30,
      addonName: "intelligence",
    };
    claimSlot("player-side", [TRANSCRIPT, detailed]);
    claimSlot("file-detail-sections", [
      detailed,
      { id: "other-section", label: "Other", priority: 50, addonName: "other" },
    ]);
    await renderFile(VIDEO);

    expect(toggleLabels()).toEqual(["Transcript", "Detailed summary"]);
    expect(drawnSectionIds().has("detailed-summary")).toBe(false);
    expect(drawnSectionIds().has("other-section")).toBe(true);
    expect(screen.getAllByTestId("slot-entry-detailed-summary")).toHaveLength(1);
  });

  it("SPEC-CORE-089 I9 draws it through file-detail-sections on a file without a player", async () => {
    wide();
    claimSlot("player-side", [TRANSCRIPT]);
    claimSlot("file-detail-sections", [
      { id: "transcript", label: "Transcript", priority: 10, addonName: "intelligence" },
    ]);
    const { unmount } = await renderFile(VIDEO);
    expect(toggleLabels()).toEqual(["Transcript"]);
    expect(drawnSectionIds().has("transcript")).toBe(false);
    unmount();

    await renderFile(IMAGE);
    expect(panelGroup()).toBeNull();
    expect(screen.queryAllByTestId("slot-entry-transcript")).toHaveLength(0);
    expect(drawnSectionIds().has("transcript")).toBe(true);
  });

  it.each([
    ["beside", () => wide()],
    ["stacked", () => stacked()],
  ] as const)(
    "SPEC-CORE-089 I9 mounts the summary note once, only as the Note panel, on a player file (%s)",
    async (_form, setup) => {
      setup();
      claimSlot("player-side", [TRANSCRIPT]);
      await renderFile(VIDEO);
      expect(panelGroup() !== null || tabs().includes("Transcript")).toBe(true);

      const hosts = screen.getAllByTestId("active-summary-host");
      expect(hosts).toHaveLength(1);
      expect(document.getElementById("inspector-panel-info")).not.toContainElement(
        hosts[0],
      );
      // The stub never draws a note, so the Note panel is mounted but has nothing to show.
      expect(isHidden(hosts[0])).toBe(true);
      expect(toggleLabels() ?? []).not.toContain("Note");
      expect(tabs()).not.toContain("Note");
    },
  );
});

describe("SPEC-CORE-088 where the description is drawn on the canonical page", () => {
  it.each([
    ["wide, inspector closed", () => wide({ open: false })],
    ["stacked, inspector closed", () => stacked({ open: false })],
  ] as const)(
    "SPEC-CORE-088 I7 never draws it under the player of a video (%s)",
    async (_form, setup) => {
      setup();
      claimSlot("player-side", [TRANSCRIPT]);
      await renderFile(VIDEO);

      const info = document.getElementById("inspector-panel-info");
      for (const node of screen.queryAllByText(DESCRIPTION)) {
        expect(info).not.toBeNull();
        expect(info).toContainElement(node);
      }
      expect(toggleLabels()).toEqual(["Transcript"]);
    },
  );
});
