/**
 * Where a `.loft`'s provider metadata is drawn: in the canonical page's Info
 * tab, and under the player only on the collection surface, which has none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import {
  claimSlot,
  loaded,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
  slotMocks,
  usePolicyMock,
} from "./harness";
import {
  NARROW_ROW,
  WIDE_ROW,
  fit,
  follows,
  installRow,
  storeOpen,
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

const LOFT = makeFile({
  filename: "watch.loft",
  title: "A YouTube clip",
  mime_type: "application/vnd.litloft.loft+json",
  description: "Recorded on location.",
});

const LOFT_METADATA = {
  id: "loft-metadata",
  label: "Loft Metadata",
  priority: 10,
  addonName: "media_import",
};

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

async function renderCanonical() {
  setApiResponses(LOFT);
  const utils = render(<FileDetailContent fileId={LOFT.id} drive="main" />);
  await shellLoaded();
  await waitFor(() => expect(fit()).not.toBeUndefined());
  return utils;
}

async function renderCollection() {
  setApiResponses(LOFT);
  const utils = render(
    <FileDetailContent fileId={LOFT.id} drive="main" surface="collection" />,
  );
  await loaded();
  return utils;
}

function metadataEntry(): HTMLElement {
  const nodes = screen.getAllByTestId("addon-slot-loft-metadata");
  expect(nodes).toHaveLength(1);
  return nodes[0];
}

describe.each([
  { form: "beside", viewport: 1400, row: WIDE_ROW },
  { form: "stacked", viewport: 1024, row: NARROW_ROW },
])("SPEC-CORE-088 I7 the .loft metadata in the $form form", ({ form, viewport, row }) => {
  it("is drawn once inside the Info tab, under the title", async () => {
    setViewport(viewport);
    installRow(row);
    storeOpen(true);
    claimSlot("loft-metadata", [LOFT_METADATA]);
    await renderCanonical();

    expect(fit()).toBe(form);
    const info = document.querySelector("#inspector-panel-info");
    expect(info).not.toBeNull();
    const entry = metadataEntry();
    expect(info!.contains(entry)).toBe(true);

    const title = document.querySelector("[data-inspector-header-title]");
    expect(title).not.toBeNull();
    expect(follows(title!, entry)).toBe(true);
  });

  it("is not drawn under the player", async () => {
    setViewport(viewport);
    installRow(row);
    storeOpen(true);
    claimSlot("loft-metadata", [LOFT_METADATA]);
    await renderCanonical();

    const player = document.querySelector(".media-detail-player");
    expect(player).not.toBeNull();
    expect(player!.contains(metadataEntry())).toBe(false);
    expect(document.querySelector(".media-detail-player-aside")).toBeNull();
  });

  it("gives the panel the file's id and drive", async () => {
    setViewport(viewport);
    installRow(row);
    storeOpen(true);
    claimSlot("loft-metadata", [LOFT_METADATA]);
    await renderCanonical();

    expect(metadataEntry()).toHaveAttribute("data-prop-file-id", LOFT.id);
    expect(metadataEntry()).toHaveAttribute("data-prop-drive", LOFT.drive);
  });
});

describe("on the collection surface, which has no Info tab", () => {
  it("draws the .loft metadata once, under the player", async () => {
    setViewport(1400);
    installRow(WIDE_ROW);
    claimSlot("loft-metadata", [LOFT_METADATA]);
    await renderCollection();

    const player = document.querySelector(".media-detail-player");
    const entry = metadataEntry();
    const aside = document.querySelector(".media-detail-player-aside");
    expect(aside).not.toBeNull();
    expect(aside!.contains(entry)).toBe(true);
    expect(player!.contains(entry)).toBe(false);
    expect(follows(player!, entry)).toBe(true);
    expect(document.querySelector("#inspector-panel-info")).toBeNull();
  });

  it("gives the panel the file's id and drive", async () => {
    setViewport(1400);
    installRow(WIDE_ROW);
    claimSlot("loft-metadata", [LOFT_METADATA]);
    await renderCollection();

    expect(metadataEntry()).toHaveAttribute("data-prop-file-id", LOFT.id);
    expect(metadataEntry()).toHaveAttribute("data-prop-drive", LOFT.drive);
  });
});

describe("a file whose slot is not filled", () => {
  it("draws no box and no entry", async () => {
    setViewport(1400);
    installRow(WIDE_ROW);
    storeOpen(true);
    await renderCanonical();

    expect(screen.queryByTestId("addon-slot-loft-metadata")).toBeNull();
    expect(document.querySelector(".media-detail-player-aside")).toBeNull();
  });
});
