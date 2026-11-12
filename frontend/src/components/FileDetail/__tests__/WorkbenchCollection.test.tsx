/**
 * The workbench on the collection playback surface (`?collection=`,
 * `?playlist=`, `?folder_play=1`), which has no inspector.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import {
  claimSlot,
  loaded,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  slotMocks,
  usePolicyMock,
} from "./harness";
import {
  LATE,
  TRANSCRIPT,
  WIDE_ROW,
  drawnSectionIds,
  entryNode,
  follows,
  installRow,
  isHidden,
  panelCard,
  panelGroup,
  propsOf,
  shownPanels,
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

const VIDEO = makeFile({ has_chapters: true, description: "Recorded on location." });
const AUDIO = makeFile({
  filename: "ep.mp3",
  file_type: "audio",
  mime_type: "audio/mpeg",
  has_chapters: false,
});
const TIE = { id: "tie", label: "Tie", priority: 50, addonName: "other" };

beforeEach(() => {
  vi.clearAllMocks();
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  setViewport(1400);
  installRow(WIDE_ROW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderCollection(file: FileItem = VIDEO) {
  setApiResponses(file);
  const utils = render(
    <FileDetailContent fileId={file.id} drive="main" surface="collection" />,
  );
  await loaded();
  return utils;
}

/** Whatever tells the chapters panel there are chapters: the file says so and the list loads with some. */
function chaptersLoaded() {
  for (const button of screen.queryAllByTestId("chapters-resolved-some")) {
    fireEvent.click(button);
  }
}

describe("SPEC-CORE-090 the collection surface's workbench", () => {
  it("SPEC-CORE-090 I1 lists Chapters as a panel at priority 50, ahead of a slot entry of equal priority", async () => {
    claimSlot("player-side", [LATE, TIE, TRANSCRIPT]);
    await renderCollection(VIDEO);
    chaptersLoaded();

    await waitFor(() =>
      expect(toggleLabels()).toEqual(["Transcript", "Chapters", "Tie", "Late"]),
    );
  });

  it("SPEC-CORE-090 I1 gives Chapters no toggle while the file has no chapters", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderCollection(makeFile({ has_chapters: false }));

    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-090 I1 takes the Chapters toggle away when the chapters turn out to be unreadable", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderCollection(VIDEO);
    chaptersLoaded();
    await waitFor(() => expect(toggleLabels()).toEqual(["Transcript", "Chapters"]));

    fireEvent.click(screen.getByTestId("chapters-resolved-empty"));

    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("SPEC-CORE-090 draws the chapters inside the Chapters card when it is on", async () => {
    await renderCollection(VIDEO);
    chaptersLoaded();
    await waitFor(() => expect(toggleLabels()).toEqual(["Chapters"]));

    fireEvent.click(toggle("Chapters"));

    expect(shownPanels()).toEqual(["Chapters"]);
    expect(panelCard("Chapters")).toContainElement(
      screen.getByTestId("chapters-panel"),
    );
    expect(storedPanels()).toEqual(["chapters"]);
  });

  it("SPEC-CORE-090 shares the stored list with the canonical page", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderCollection(VIDEO);

    expect(toggle("Transcript")).toHaveAttribute("aria-pressed", "true");
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(propsOf("transcript")).toMatchObject({
      active: true,
      labelledByHost: true,
      fillHeight: true,
    });
  });

  it("SPEC-CORE-090 I5 orders a video's page as the player, the row, the panels, then the file information", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderCollection(VIDEO);

    const player = screen.getByTestId("file-preview");
    const row = panelGroup()!;
    expect(row).not.toBeNull();
    const card = panelCard("Transcript");
    const info = screen.getByTestId("file-actions");
    expect(follows(player, row)).toBe(true);
    expect(follows(row, card)).toBe(true);
    expect(follows(card, info)).toBe(true);
  });

  it("SPEC-CORE-090 orders audio's left column as the player, the row, the panels, then the file information", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderCollection(AUDIO);

    const row = panelGroup()!;
    expect(row).not.toBeNull();
    const card = panelCard("Transcript");
    expect(follows(screen.getByTestId("file-preview"), row)).toBe(true);
    expect(follows(row, card)).toBe(true);
    expect(follows(card, screen.getByTestId("file-actions"))).toBe(true);
  });

  it.each([1400, 400])(
    "SPEC-CORE-090 has no tab form at %ipx",
    async (width) => {
      setViewport(width);
      claimSlot("player-side", [TRANSCRIPT]);
      await renderCollection(VIDEO);

      expect(toggleLabels()).toEqual(["Transcript"]);
      expect(tabs()).toEqual([]);
    },
  );

  it("SPEC-CORE-090 I3 offers no beside/below toggle and neither reads nor removes the old preference", async () => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    claimSlot("player-side", [TRANSCRIPT]);
    await renderCollection(VIDEO);

    expect(toggleLabels()).toEqual(["Transcript"]);
    expect(
      screen.queryByRole("button", { name: /(beside|below) the player/i }),
    ).toBeNull();
    expect(document.documentElement.hasAttribute("data-media-layout")).toBe(false);
    expect(window.localStorage.getItem("media-layout-preference")).toBe("stacked");
  });

  it("SPEC-CORE-089 I9 mounts the summary note once, only as the Note panel, on a player file", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderCollection(VIDEO);
    expect(toggleLabels()).toEqual(["Transcript"]);

    const hosts = screen.getAllByTestId("active-summary-host");
    expect(hosts).toHaveLength(1);
    expect(isHidden(hosts[0])).toBe(true);
    expect(toggleLabels()).not.toContain("Note");
  });

  it("SPEC-CORE-089 I9 leaves an id that is also a player-side entry out of the sections", async () => {
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
    await renderCollection(VIDEO);

    expect(toggleLabels()).toEqual(["Transcript", "Detailed summary"]);
    expect(drawnSectionIds().has("detailed-summary")).toBe(false);
    expect(drawnSectionIds().has("other-section")).toBe(true);
    expect(entryNode("detailed-summary")).toBeTruthy();
  });
});
