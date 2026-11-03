import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import type { SlotEntry } from "@/lib/addons";
import {
  claimSlot,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
  slotMocks,
  slotPropsByNode,
  usePolicyMock,
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
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const VIDEO: Partial<FileItem> = {
  mime_type: "video/mp4",
  file_type: "video",
  filename: "clip.mp4",
};
const MARKDOWN: Partial<FileItem> = {
  mime_type: "text/markdown",
  file_type: "document",
  filename: "note.md",
};

const ASK: SlotEntry = {
  id: "ask",
  label: "Ask",
  i18n_key: "intelligence.tabs.ask",
  priority: 10,
  addonName: "intelligence",
};

const PHONE_WIDTH = 400;

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-media-layout");
  setViewport();
});

async function renderFile(kind: Partial<FileItem>) {
  setApiResponses(makeFile({ has_chapters: false, ...kind }));
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await shellLoaded();
  return utils;
}

function lowerInspector(): () => void {
  const node = screen
    .queryAllByTestId("slot-entry-ask")
    .find((entry) => entry.getAttribute("data-addon") === "intelligence");
  if (!node) throw new Error("the inspector tab entry is not mounted");
  const props = slotPropsByNode.get(node);
  if (!props) throw new Error("the entry was not rendered through the harness");
  const lower = props.lowerInspector;
  if (typeof lower !== "function") {
    throw new Error("the entry was handed no lowerInspector");
  }
  return lower as () => void;
}

const sheetSnap = () =>
  screen.getByTestId("file-detail-shell").dataset.sheetSnap;

async function openSheet() {
  fireEvent.click(screen.getByTestId("inspector-toggle"));
  return screen.findByTestId("mobile-inspector-sheet");
}

const KINDS: [string, Partial<FileItem>][] = [
  ["a video", VIDEO],
  ["a Markdown note", MARKDOWN],
];

describe("SPEC-CORE-036 - lowerInspector drops the phone's sheet to its bar", () => {
  beforeEach(() => {
    setViewport(PHONE_WIDTH);
    claimSlot("inspector-tabs", [ASK]);
  });

  it.each(KINDS)("%s: from half", async (_name, kind) => {
    await renderFile(kind);
    const sheet = await openSheet();
    expect(sheet.dataset.snap).toBe("half");
    const lower = lowerInspector();

    act(() => lower());

    expect(await screen.findByTestId("mobile-inspector-peek")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
    expect(sheetSnap()).toBe("peek");
  });

  it.each(KINDS)("%s: from full", async (_name, kind) => {
    await renderFile(kind);
    await openSheet();
    const lower = lowerInspector();

    // Tapping the sheet's handle cycles to the next snap point, which is
    // full.
    fireEvent.click(document.querySelector("[data-vaul-handle]")!);
    await waitFor(() =>
      expect(
        screen.getByTestId("mobile-inspector-sheet").dataset.snap,
      ).toBe("full"),
    );

    act(() => lower());

    expect(await screen.findByTestId("mobile-inspector-peek")).toBeInTheDocument();
    expect(sheetSnap()).toBe("peek");
  });

  it("does nothing at peek", async () => {
    await renderFile(VIDEO);
    await openSheet();
    const lower = lowerInspector();

    act(() => lower());
    await screen.findByTestId("mobile-inspector-peek");

    act(() => lower());

    expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
    expect(sheetSnap()).toBe("peek");
  });
});

describe("SPEC-CORE-036 - lowerInspector on a desktop", () => {
  it("does nothing, and the inspector stays where it is", async () => {
    claimSlot("inspector-tabs", [ASK]);
    await renderFile(VIDEO);

    const lower = lowerInspector();
    act(() => lower());

    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inspector-peek")).toBeNull();
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
    expect(sheetSnap()).toBeUndefined();
  });
});

describe("SPEC-CORE-036 - lowerInspector reaches every file-page slot", () => {
  it("has one stable identity and is handed to every slot", async () => {
    claimSlot("inspector-tabs", [ASK]);
    const { rerender } = await renderFile(VIDEO);
    const first = lowerInspector();

    const slots = screen.queryAllByTestId(/^addon-slot-/);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const props = slotPropsByNode.get(slot);
      expect(typeof props?.lowerInspector).toBe("function");
      expect(props?.lowerInspector).toBe(first);
    }

    rerender(<FileDetailContent fileId="f1" drive="main" />);

    expect(lowerInspector()).toBe(first);
  });
});
