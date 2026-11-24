import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";

import { FileDetailContent } from "../../FileDetailContent";
import { useProfile } from "@/components/ProfileProvider";
import type { FileItem } from "@/types";
import type { SlotEntry } from "@/lib/addons";
import {
  claimSlot,
  loaded,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
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
const MARKDOWN: Partial<FileItem> = {
  mime_type: "text/markdown",
  file_type: "document",
  filename: "note.md",
};
const HTML: Partial<FileItem> = {
  mime_type: "text/html",
  file_type: "document",
  filename: "page.html",
};
const IMAGE: Partial<FileItem> = {
  mime_type: "image/jpeg",
  file_type: "image",
  filename: "photo.jpg",
};

const ASK: SlotEntry = {
  id: "ask",
  label: "Ask",
  i18n_key: "intelligence.tabs.ask",
  priority: 10,
  addonName: "intelligence",
};

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

function entryNode(id = "ask"): HTMLElement | null {
  return (
    screen
      .queryAllByTestId(`slot-entry-${id}`)
      .find((node) => node.getAttribute("data-addon") === "intelligence") ?? null
  );
}

interface Controller {
  goTo(location: { page: number } | { section: number }): void;
}

function slotProps(node: Element | null): Record<string, unknown> {
  if (!node) throw new Error("the slot entry is not mounted");
  const props = slotPropsByNode.get(node);
  if (!props) throw new Error("the slot entry was not rendered through the harness");
  return props;
}

const documentController = () =>
  slotProps(entryNode()).documentController as Controller | null;

async function waitForController(): Promise<Controller> {
  let found: Controller | null = null;
  await waitFor(() => {
    found = documentController();
    expect(found).not.toBeNull();
  });
  return found!;
}

function currentPdfPage(): string | null {
  return (
    document.querySelector("section[data-pdf-page]")?.getAttribute("data-pdf-page") ??
    null
  );
}

/**
 * The Pages tab is drawn from the document's page count, which arrives after
 * the viewer has mounted. Until then `goTo` is ignored for every page, so a
 * test that acts or asserts "nothing moved" must wait for this first.
 */
async function waitForPagesTab(): Promise<HTMLElement> {
  return screen.findByRole("tab", { name: "Pages" });
}

const GO_TO_PAGE_LABEL = "Go to page 6";

describe("SPEC-CORE-036 I9 - documentController on a file page that has no document viewer", () => {
  it.each<[string, Partial<FileItem>]>([
    ["a Markdown note", MARKDOWN],
    ["an HTML preview", HTML],
    ["an image", IMAGE],
  ])("%s gets null", async (_name, kind) => {
    claimSlot("inspector-tabs", [ASK]);
    await renderFile(kind);

    expect(entryNode()).not.toBeNull();
    expect(documentController()).toBeNull();
  });
});

describe("SPEC-CORE-036 I9 - documentController while a PDF viewer is mounted", () => {
  beforeEach(() => {
    claimSlot("inspector-tabs", [ASK]);
  });

  it("is non-null, and goTo({ page }) lands where the Pages panel lands", async () => {
    await renderFile(PDF);
    const controller = await waitForController();
    expect(currentPdfPage()).toBe("1");

    fireEvent.click(await waitForPagesTab());
    const row = await screen.findByRole("button", { name: GO_TO_PAGE_LABEL });
    fireEvent.click(row);
    await waitFor(() => expect(currentPdfPage()).toBe("6"));

    act(() => controller.goTo({ page: 1 }));
    await waitFor(() => expect(currentPdfPage()).toBe("1"));

    act(() => controller.goTo({ page: 6 }));
    await waitFor(() => expect(currentPdfPage()).toBe("6"));
  });

  it("does nothing for a page out of range", async () => {
    await renderFile(PDF);
    const controller = await waitForController();
    await waitForPagesTab();
    act(() => controller.goTo({ page: 5 }));
    await waitFor(() => expect(currentPdfPage()).toBe("5"));

    act(() => controller.goTo({ page: 99 }));
    act(() => controller.goTo({ page: 0 }));
    expect(currentPdfPage()).toBe("5");
  });

  it("does nothing for a section", async () => {
    await renderFile(PDF);
    const controller = await waitForController();
    await waitForPagesTab();
    act(() => controller.goTo({ page: 4 }));
    await waitFor(() => expect(currentPdfPage()).toBe("4"));

    act(() => controller.goTo({ section: 3 }));
    expect(currentPdfPage()).toBe("4");
  });

  it("keeps its identity across a re-render", async () => {
    const { rerender } = await renderFile(PDF);
    const first = await waitForController();

    rerender(<FileDetailContent fileId="f1" drive="main" />);

    expect(await waitForController()).toBe(first);
  });

  it("is handed to every file-page slot", async () => {
    await renderFile(PDF);
    const controller = await waitForController();

    const slots = screen.queryAllByTestId(/^addon-slot-/);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const props = slotProps(slot);
      expect(props.documentController).toBe(controller);
      expect(typeof props.lowerInspector).toBe("function");
    }

    const entry = slotProps(entryNode());
    expect(entry.documentController).toBe(controller);
    expect(typeof entry.lowerInspector).toBe("function");
  });
});

describe("SPEC-CORE-036 I9 - documentController and the EPUB reader", () => {
  const READY = {
    type: "ready",
    dir: "ltr",
    vertical: false,
    toc: [],
  };

  async function fromReader(source: Window | null, data: unknown) {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: window.location.origin,
          source,
        }),
      );
      await Promise.resolve();
    });
  }

  function readerIframe(container: HTMLElement): HTMLIFrameElement {
    const frame = container.querySelector("iframe");
    if (!frame) throw new Error("the reader frame is not mounted");
    return frame;
  }

  function spyOnReader(frame: HTMLIFrameElement) {
    return vi
      .spyOn(frame.contentWindow!, "postMessage")
      .mockImplementation(() => {});
  }

  const sentOfType = (posted: ReturnType<typeof spyOnReader>, type: string) =>
    posted.mock.calls
      .map((call) => call[0] as { type: string })
      .filter((message) => message.type === type);

  beforeEach(() => {
    claimSlot("inspector-tabs", [ASK]);
  });

  it("is null until the reader posts ready, then sends goToSection for a section", async () => {
    const { container } = await renderFile(EPUB);
    await waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const frame = readerIframe(container);
    const posted = spyOnReader(frame);

    expect(documentController()).toBeNull();

    await fromReader(frame.contentWindow, { type: "boot" });
    await waitFor(() => expect(sentOfType(posted, "open")).toHaveLength(1));
    expect(documentController()).toBeNull();

    await fromReader(frame.contentWindow, READY);
    const controller = await waitForController();

    act(() => controller.goTo({ section: 3 }));
    expect(sentOfType(posted, "goToSection")).toEqual([
      { type: "goToSection", section: 3 },
    ]);

    // The EPUB reader has no page to move to.
    act(() => controller.goTo({ page: 2 }));
    expect(sentOfType(posted, "goToSection")).toHaveLength(1);
  });

  it("keeps its identity across a re-render", async () => {
    const { container, rerender } = await renderFile(EPUB);
    await waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const frame = readerIframe(container);
    spyOnReader(frame);
    await fromReader(frame.contentWindow, READY);
    const first = await waitForController();

    rerender(<FileDetailContent fileId="f1" drive="main" />);

    await waitFor(() => expect(container.querySelector("iframe")).toBe(frame));
    expect(await waitForController()).toBe(first);
  });

  it("goes back to null when the reader is replaced, and returns on the next ready", async () => {
    const { container, rerender } = await renderFile(EPUB);
    await waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const firstFrame = readerIframe(container);
    spyOnReader(firstFrame);
    await fromReader(firstFrame.contentWindow, READY);
    await waitForController();

    rerender(
      <FileDetailContent fileId="f1" drive="main" initialSection={2} />,
    );

    await waitFor(() => {
      expect(container.querySelector("iframe")).not.toBe(firstFrame);
    });
    expect(documentController()).toBeNull();

    const secondFrame = readerIframe(container);
    const posted = spyOnReader(secondFrame);
    await fromReader(secondFrame.contentWindow, { type: "boot" });
    await waitFor(() => expect(sentOfType(posted, "open")).toHaveLength(1));
    await fromReader(secondFrame.contentWindow, READY);

    expect(await waitForController()).not.toBeNull();
    expect(sentOfType(posted, "open")[0]).toMatchObject({ section: 1 });
  });
});
