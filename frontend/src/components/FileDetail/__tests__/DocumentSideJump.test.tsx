import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";

import { FileDetailContent } from "../../FileDetailContent";
import { useProfile } from "@/components/ProfileProvider";
import type { FileItem } from "@/types";
import type { SlotEntry } from "@/lib/addons";
import {
  claimSlot,
  loaded,
  makeFile,
  raiseSheetFromStrip,
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

const pdfDoc = vi.hoisted(() => {
  const doc = {
    numPages: 8,
    outline: null as unknown,
    getOutline: async () => doc.outline,
    getDestination: async () => null,
    getPageIndex: async (ref: unknown) => (ref as { index: number }).index,
    getPage: async () => ({ getViewport: () => ({ width: 595, height: 842 }) }),
    getViewerPreferences: async () => null,
  };
  return doc;
});

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess?: (pdf: unknown) => void;
  }) => {
    useEffect(() => {
      onLoadSuccess?.(pdfDoc);
    }, [onLoadSuccess]);
    return <div>{children}</div>;
  },
  Page: ({
    pageNumber,
    onLoadSuccess,
  }: {
    pageNumber: number;
    onLoadSuccess?: (page: {
      getViewport: () => { width: number; height: number };
    }) => void;
  }) => {
    useEffect(() => {
      onLoadSuccess?.({ getViewport: () => ({ width: 595, height: 842 }) });
    }, [pageNumber, onLoadSuccess]);
    return <div data-testid="pdf-mock-page">Selectable page {pageNumber}</div>;
  },
}));

vi.mock("@/components/ProfileProvider", () => ({ useProfile: vi.fn() }));
vi.mock("@/components/player/hooks/useFullscreen", () => ({
  useFullscreen: () => ({
    isFullscreen: false,
    isPseudo: false,
    toggle: vi.fn(),
    exit: vi.fn(),
  }),
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
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
  recordFileView: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0.4, duration: 1 }),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedPlayback: vi.fn().mockReturnValue({ position: 0, duration: 1 }),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const mockUseProfile = vi.mocked(useProfile);

const PDF: Partial<FileItem> = {
  mime_type: "application/pdf",
  file_type: "document",
  filename: "paper.pdf",
};
const EPUB: Partial<FileItem> = {
  mime_type: "application/epub+zip",
  file_type: "document",
  filename: "book.epub",
};

const DETAIL = {
  id: "detailed-summary",
  label: "Detailed summary",
  i18n_key: "intelligence.slots.detailedSummary",
  priority: 30,
  addonName: "intelligence",
  wide: true,
} as SlotEntry;

const BOOK = new Uint8Array([80, 75, 3, 4]);
let fetchMock: ReturnType<typeof vi.fn>;

/** jsdom has none; the viewers only need something they can observe. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  setViewport();
  mockUseProfile.mockReturnValue({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
  fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: async () => BOOK.slice().buffer });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderFile(kind: Partial<FileItem>, initialSection?: number) {
  setApiResponses(makeFile({ description: "", has_chapters: false, ...kind }));
  const utils = render(
    <FileDetailContent
      fileId="f1"
      drive="main"
      initialSection={initialSection}
    />,
  );
  await loaded();
  return utils;
}

async function renderPhone(kind: Partial<FileItem>) {
  setViewport(600);
  setApiResponses(makeFile({ description: "", has_chapters: false, ...kind }));
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await shellLoaded();
  return utils;
}

const DETAIL_LABEL = "Detailed summary";

type Target = { fileId: string; page?: number; section?: number };

function entryNode(): HTMLElement {
  const node = screen
    .queryAllByTestId("slot-entry-detailed-summary")
    .find((candidate) => candidate.getAttribute("data-addon") === "intelligence");
  if (!node) throw new Error("the document-side entry is not mounted");
  return node;
}

function entryProps(): Record<string, unknown> {
  const props = slotPropsByNode.get(entryNode());
  if (!props) throw new Error("the entry was not rendered through the harness");
  return props;
}

function reportAvailable() {
  fireEvent.click(
    within(entryNode()).getByTestId("slot-entry-detailed-summary-filled"),
  );
}

function openInViewer(target: Target): boolean {
  const open = entryProps().openInViewer as ((t: Target) => boolean) | undefined;
  if (typeof open !== "function") {
    throw new Error("the document-side entry was given no openInViewer");
  }
  let answer = false;
  act(() => {
    answer = open(target);
  });
  return answer;
}

function currentPdfPage(): string | null {
  return (
    document.querySelector("section[data-pdf-page]")?.getAttribute("data-pdf-page") ??
    null
  );
}

const selectedTab = () =>
  screen
    .queryAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

/** The page count arrives after the viewer mounts; until then `goTo` is ignored. */
const waitForPagesTab = () => screen.findByRole("tab", { name: "Pages" });

describe("SPEC-CORE-132 I8 - a jump to the open file moves its viewer in place", () => {
  beforeEach(() => {
    claimSlot("document-side", [DETAIL]);
  });

  it("answers true for a page of the open PDF, moves the viewer there, and keeps the tab and the URL", async () => {
    await renderFile(PDF);
    await waitForPagesTab();
    reportAvailable();
    fireEvent.click(screen.getByRole("tab", { name: DETAIL_LABEL }));
    const before = { pathname: location.pathname, search: location.search };

    expect(openInViewer({ fileId: "f1", page: 6 })).toBe(true);

    await waitFor(() => expect(currentPdfPage()).toBe("6"));
    expect(selectedTab()).toBe(DETAIL_LABEL);
    expect({ pathname: location.pathname, search: location.search }).toEqual(before);
    expect(entryProps().active).toBe(true);
  });

  it("answers false for another file and leaves the viewer where it is", async () => {
    await renderFile(PDF);
    await waitForPagesTab();
    reportAvailable();
    expect(openInViewer({ fileId: "f1", page: 3 })).toBe(true);
    await waitFor(() => expect(currentPdfPage()).toBe("3"));

    expect(openInViewer({ fileId: "other0000001", page: 6 })).toBe(false);
    expect(currentPdfPage()).toBe("3");
  });

  it("answers false on a file with no document viewer", async () => {
    await renderFile({ mime_type: "application/octet-stream", file_type: "other", filename: "a.bin" });
    reportAvailable();

    expect(openInViewer({ fileId: "f1", page: 2 })).toBe(false);
  });

  it("sends a section to the open EPUB's reader", async () => {
    const { container } = await renderFile(EPUB);
    await waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const frame = container.querySelector("iframe")!;
    const posted = vi
      .spyOn(frame.contentWindow!, "postMessage")
      .mockImplementation(() => {});
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ready", dir: "ltr", vertical: false, toc: [] },
          origin: window.location.origin,
          source: frame.contentWindow,
        }),
      );
      await Promise.resolve();
    });
    reportAvailable();

    await waitFor(() => expect(openInViewer({ fileId: "f1", section: 3 })).toBe(true));
    expect(
      posted.mock.calls
        .map((call) => call[0] as { type: string })
        .filter((message) => message.type === "goToSection"),
    ).toContainEqual({ type: "goToSection", section: 3 });
    expect(container.querySelector("iframe")).toBe(frame);
  });

  it("on a phone, lowers the sheet after the jump", async () => {
    await renderPhone(PDF);
    raiseSheetFromStrip();
    await screen.findByTestId("mobile-inspector-sheet");
    await waitForPagesTab();
    reportAvailable();
    fireEvent.click(screen.getByRole("tab", { name: DETAIL_LABEL }));

    expect(openInViewer({ fileId: "f1", page: 5 })).toBe(true);

    await waitFor(() => expect(currentPdfPage()).toBe("5"));
    await waitFor(() =>
      expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull(),
    );
  });
});
