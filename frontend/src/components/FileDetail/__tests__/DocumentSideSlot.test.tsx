import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import { SHEET_SNAP_HALF_FALLBACK } from "@/lib/sheetSnap";
import type { FileItem } from "@/types";
import type { SlotEntry } from "@/lib/addons";
import {
  claimSlot,
  loaded,
  makeFile,
  measureRow,
  publishedPdfState,
  raiseSheetFromStrip,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
  slotMocks,
  slotPropsByNode,
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
vi.mock("../../markdown/MarkdownDocumentLayout", async () => ({
  MarkdownDocumentLayout: (await import("./harness")).MarkdownDocumentLayoutStub,
}));
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
vi.mock("../pdf/PdfPagesTab", () => ({
  PdfPagesTab: () => <div data-testid="pdf-pages-tab" />,
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

const PDF = {
  mime_type: "application/pdf",
  file_type: "document" as const,
  filename: "paper.pdf",
};
const ARCHIVE = {
  mime_type: "application/x-zip-compressed",
  file_type: "archive" as const,
  filename: "pages.zip",
};
const IMAGE = {
  mime_type: "image/jpeg",
  file_type: "image" as const,
  filename: "photo.jpg",
};
const TEXT = {
  mime_type: "text/csv",
  file_type: "document" as const,
  filename: "table.csv",
};
const UNKNOWN = {
  mime_type: "application/octet-stream",
  file_type: "other" as const,
  filename: "blob.bin",
};
const MARKDOWN = {
  mime_type: "text/markdown",
  file_type: "document" as const,
  filename: "note.md",
};
const HTML = {
  mime_type: "text/html",
  file_type: "document" as const,
  filename: "page.html",
};
const VIDEO = {
  mime_type: "video/mp4",
  file_type: "video" as const,
  filename: "clip.mp4",
};

/** Files the page draws in `MediaCanvas` with no player. */
const WITHOUT_PLAYER: [string, Partial<FileItem>][] = [
  ["a PDF", PDF],
  ["an archive", ARCHIVE],
  ["an image", IMAGE],
  ["a text preview", TEXT],
  ["a file nothing can preview", UNKNOWN],
];

type DocumentSideEntry = SlotEntry & { wide?: boolean };

const DETAIL: DocumentSideEntry = {
  id: "detailed-summary",
  label: "Detailed summary",
  i18n_key: "intelligence.slots.detailedSummary",
  priority: 30,
  addonName: "intelligence",
  wide: true,
};

const ASK: SlotEntry = {
  id: "ask",
  label: "Ask",
  i18n_key: "intelligence.tabs.ask",
  priority: 10,
  addonName: "intelligence",
};

const DETAIL_LABEL = "Detailed summary";

beforeEach(() => {
  vi.clearAllMocks();
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  publishedPdfState.value = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  setViewport();
  measureRow(1200);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderKind(
  kind: Partial<FileItem>,
  surface?: "collection",
) {
  setApiResponses(
    makeFile({
      description: "Recorded on location.",
      has_chapters: false,
      ...kind,
    }),
  );
  const utils = render(
    <FileDetailContent fileId="f1" drive="main" surface={surface} />,
  );
  if (surface === "collection") {
    await shellLoaded();
  } else {
    await loaded();
    await waitFor(() =>
      expect(screen.getByTestId("inspector-fit-host")).toHaveAttribute(
        "data-inspector-fit",
      ),
    );
  }
  return utils;
}

async function renderPhone(kind: Partial<FileItem>) {
  setViewport(600);
  setApiResponses(
    makeFile({ description: "Recorded on location.", has_chapters: false, ...kind }),
  );
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await shellLoaded();
  return utils;
}

const tabs = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent?.trim());

const selectedTab = () =>
  screen
    .queryAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

function entryNodes(id: string, addon = "intelligence"): HTMLElement[] {
  return screen
    .queryAllByTestId(`slot-entry-${id}`)
    .filter((node) => node.getAttribute("data-addon") === addon);
}

function entryNode(id: string, addon = "intelligence"): HTMLElement {
  const found = entryNodes(id, addon);
  if (found.length === 0) {
    throw new Error(`the document-side entry ${addon}/${id} is not mounted`);
  }
  return found[0];
}

function propsOf(node: Element): Record<string, unknown> {
  const props = slotPropsByNode.get(node);
  if (!props) throw new Error("the entry was not rendered through the harness");
  return props;
}

function report(id: string, available: boolean, addon = "intelligence") {
  fireEvent.click(
    within(entryNode(id, addon)).getByTestId(
      `slot-entry-${id}-${available ? "filled" : "empty"}`,
    ),
  );
}

const callSelect = (id: string) => {
  const select = propsOf(entryNode(id)).select as (() => void) | undefined;
  if (typeof select !== "function") {
    throw new Error(`the entry ${id} was given no select()`);
  }
  act(() => select());
};

const canvas = () => document.querySelector(".media-detail-host")?.closest("main") ?? null;

describe("SPEC-CORE-132 I3 - a document-side entry is an inspector tab once it reports", () => {
  it.each(WITHOUT_PLAYER)(
    "%s lists it after Info once it reports available, and not before",
    async (_name, kind) => {
      claimSlot("document-side", [DETAIL]);
      await renderKind(kind);

      expect(tabs()).not.toContain(DETAIL_LABEL);
      report("detailed-summary", false);
      expect(tabs()).not.toContain(DETAIL_LABEL);

      report("detailed-summary", true);
      expect(tabs()).toEqual(["Info", DETAIL_LABEL]);
    },
  );

  it("a Markdown file shown without the editor lists it too", async () => {
    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    claimSlot("document-side", [DETAIL]);
    await renderKind(MARKDOWN);
    report("detailed-summary", true);

    expect(tabs()).toEqual(["Info", DETAIL_LABEL]);
  });

  it("places it after Pages and before Related and the inspector-tabs entries", async () => {
    publishedPdfState.value = { numPages: 12, outline: [] };
    withRelations(1);
    claimSlot("inspector-tabs", [ASK]);
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("ask", true);
    report("detailed-summary", true);

    expect(tabs()).toEqual(["Info", "Pages", DETAIL_LABEL, "Related", "Ask"]);
  });

  it("sorts several document-side tabs by priority, whatever order they arrive in", async () => {
    claimSlot("document-side", [
      { ...DETAIL, id: "late", i18n_key: "intelligence.slots.transcript", priority: 90 },
      { ...DETAIL, id: "early", i18n_key: "intelligence.slots.scenes", priority: 5 },
    ]);
    await renderKind(PDF);
    report("late", true);
    report("early", true);

    expect(tabs()).toEqual(["Info", "Scenes", "Transcript"]);
  });

  it("takes the tab away when the entry reports unavailable again", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);
    expect(tabs()).toContain(DETAIL_LABEL);

    report("detailed-summary", false);
    expect(tabs()).not.toContain(DETAIL_LABEL);
    expect(entryNode("detailed-summary")).toBeInTheDocument();
  });

  it("hands the entry the tab props, select and openInViewer", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);

    const node = entryNode("detailed-summary");
    expect(node).toHaveAttribute("data-fill-height", "true");
    expect(node).toHaveAttribute("data-labelled-by-host", "true");
    const props = propsOf(node);
    expect(typeof props.onAvailability).toBe("function");
    expect(typeof props.select).toBe("function");
    expect(typeof props.openInViewer).toBe("function");
    expect(props.active).toBe(false);
  });
});

describe("SPEC-CORE-132 I3 - ids are keyed by slot", () => {
  it("draws an id that is a document-side entry only as the tab, not from file-detail-sections", async () => {
    claimSlot("document-side", [{ ...DETAIL, id: "fixture-summary" }]);
    claimSlot("file-detail-sections", [
      { ...DETAIL, id: "fixture-summary" },
      { ...DETAIL, id: "summary", label: "AI summary" },
    ]);
    await renderKind(PDF);
    report("fixture-summary", true);

    const sections = screen.queryAllByTestId(/^addon-slot-(all|exclude:|include:)/);
    expect(sections.length).toBeGreaterThan(0);
    for (const slot of sections) {
      const tag = slot.getAttribute("data-testid")!;
      if (tag === "addon-slot-all") {
        throw new Error("file-detail-sections is drawn with nothing excluded");
      }
      if (tag.startsWith("addon-slot-include:")) {
        expect(tag.slice("addon-slot-include:".length).split(",")).not.toContain(
          "fixture-summary",
        );
      } else {
        expect(tag.slice("addon-slot-exclude:".length).split(",")).toContain(
          "fixture-summary",
        );
      }
    }
    expect(entryNodes("fixture-summary")).toHaveLength(1);
  });

  it("keeps a core Pages tab when a document-side entry shares its id", async () => {
    publishedPdfState.value = { numPages: 12, outline: [] };
    claimSlot("document-side", [{ ...DETAIL, id: "pages", i18n_key: "inspector.tabs.pages" }]);
    await renderKind(PDF);
    expect(tabs()).toEqual(["Info", "Pages"]);

    report("pages", true);
    expect(tabs()).toEqual(["Info", "Pages", "Pages"]);
    const ids = screen.getAllByRole("tab").map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);

    report("pages", false);
    expect(tabs()).toEqual(["Info", "Pages"]);
    expect(screen.getByTestId("pdf-pages-tab")).toBeInTheDocument();
  });

  it("keeps a document-side entry apart from an inspector-tabs entry with the same id", async () => {
    claimSlot("inspector-tabs", [{ ...ASK, id: "detailed-summary" }]);
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);

    report("detailed-summary", true, "intelligence");
    const tabButtons = screen.getAllByRole("tab");
    const ids = tabButtons.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(entryNodes("detailed-summary")).toHaveLength(2);
  });
});

describe("SPEC-CORE-132 I2 - a file without a player keeps no summary in the canvas", () => {
  it.each(WITHOUT_PLAYER)(
    "%s puts the summary note last in Info before the comments, and the tab's entry outside main",
    async (_name, kind) => {
      claimSlot("document-side", [DETAIL]);
      claimSlot("file-detail-sections", [{ ...DETAIL, id: "summary", label: "AI summary" }]);
      await renderKind(kind);
      report("detailed-summary", true);

      const main = canvas()!;
      expect(main).not.toBeNull();

      const notes = screen.getAllByTestId("active-summary-host");
      expect(notes).toHaveLength(1);
      expect(main).not.toContainElement(notes[0]);
      expect(entryNodes("detailed-summary")).toHaveLength(1);
      expect(main).not.toContainElement(entryNode("detailed-summary"));

      const info = document.getElementById("inspector-panel-info")!;
      expect(info).toContainElement(notes[0]);
      const comments = within(info).getByTestId("comments");
      const precedes = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(precedes(notes[0], comments)).toBe(true);
      // Every other Info block comes before it.
      for (const other of [
        within(info).getByTestId("file-action-row"),
        within(info).getByTestId("tag-chips-stub"),
        ...within(info).queryAllByTestId(/^addon-slot-/),
      ]) {
        expect(precedes(other, notes[0])).toBe(true);
      }
    },
  );

  it("on a phone, puts the summary note in the sheet's Info and nothing in main", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderPhone(PDF);
    raiseSheetFromStrip();
    await screen.findByTestId("mobile-inspector-sheet");

    const main = canvas()!;
    const notes = screen.queryAllByTestId("active-summary-host");
    expect(notes.length).toBeLessThanOrEqual(1);
    for (const note of notes) expect(main).not.toContainElement(note);
    expect(within(screen.getByTestId("mobile-inspector-sheet")).getAllByTestId(
      "active-summary-host",
    )).toHaveLength(1);
    expect(entryNodes("detailed-summary")).toHaveLength(1);
    expect(main).not.toContainElement(entryNode("detailed-summary"));
  });
});

describe("SPEC-CORE-132 I9 - only a file without a player gets a document-side tab", () => {
  it("lists it on a PDF, and not on a Markdown file with the editor, an HTML page or a video", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);
    expect(tabs()).toContain(DETAIL_LABEL);

    for (const kind of [MARKDOWN, HTML, VIDEO]) {
      cleanup();
      setApiResponses(makeFile({ description: "", has_chapters: false, ...kind }));
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();
      if (kind !== VIDEO) {
        expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
      }
      for (const node of entryNodes("detailed-summary")) {
        fireEvent.click(within(node).getByTestId("slot-entry-detailed-summary-filled"));
      }
      expect({ kind: kind.filename, tabs: tabs() }).toEqual({
        kind: kind.filename,
        tabs: expect.not.arrayContaining([DETAIL_LABEL]),
      });
      expect(entryNodes("detailed-summary")).toHaveLength(0);
    }
  });
});

describe("SPEC-CORE-132 I10 - active is true only while the tab is selected", () => {
  it("follows the selection", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);
    const active = () => propsOf(entryNode("detailed-summary")).active;

    expect(selectedTab()).toBe("Info");
    expect(active()).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: DETAIL_LABEL }));
    expect(selectedTab()).toBe(DETAIL_LABEL);
    expect(active()).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    expect(active()).toBe(false);
  });
});

describe("SPEC-CORE-132 §1.7 - select() from the entry", () => {
  it("selects a listed tab", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);
    expect(selectedTab()).toBe("Info");

    callSelect("detailed-summary");

    expect(selectedTab()).toBe(DETAIL_LABEL);
    expect(propsOf(entryNode("detailed-summary")).active).toBe(true);
  });

  it("does nothing for an entry that is not listed", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", false);

    callSelect("detailed-summary");

    expect(tabs()).not.toContain(DETAIL_LABEL);
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    expect(propsOf(entryNode("detailed-summary")).active).toBe(false);
  });

  it("SPEC-CORE-132 I11 selects a tab that reported available in the same handler", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    expect(tabs()).not.toContain(DETAIL_LABEL);
    const props = propsOf(entryNode("detailed-summary"));
    const onAvailability = props.onAvailability as (available: boolean) => void;
    const select = props.select as (() => void) | undefined;
    expect(typeof select).toBe("function");

    act(() => {
      onAvailability(true);
      select!();
    });

    expect(tabs()).toContain(DETAIL_LABEL);
    expect(selectedTab()).toBe(DETAIL_LABEL);
  });

  it("SPEC-CORE-132 I11 on a phone raises the sheet to its half snap", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderPhone(PDF);
    raiseSheetFromStrip();
    await screen.findByTestId("mobile-inspector-sheet");
    report("detailed-summary", true);

    callSelect("detailed-summary");

    expect(selectedTab()).toBe(DETAIL_LABEL);
    const drawer = screen.getByTestId("mobile-inspector-sheet");
    const published = Number.parseFloat(
      drawer.style.getPropertyValue("--snap-point-height"),
    );
    expect(1 - published / window.innerHeight).toBeCloseTo(
      SHEET_SNAP_HALF_FALLBACK,
      5,
    );
  });
});

describe("SPEC-CORE-132 §1.6 - openInViewer is given only on the file page's document-side tab", () => {
  it("is a document-side prop on the file page, and absent on the collection surface", async () => {
    claimSlot("document-side", [DETAIL]);
    claimSlot("file-detail-sections", [DETAIL]);
    await renderKind(PDF);
    report("detailed-summary", true);
    expect(typeof propsOf(entryNode("detailed-summary")).openInViewer).toBe(
      "function",
    );
    cleanup();

    await renderKind(PDF, "collection");
    expect(tabs()).not.toContain(DETAIL_LABEL);
    const nodes = [
      ...screen.queryAllByTestId(/^addon-slot-/),
      ...screen.queryAllByTestId(/^slot-entry-/),
    ];
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const props = slotPropsByNode.get(node) ?? {};
      expect(props.openInViewer).toBeUndefined();
      expect(props.select).toBeUndefined();
    }
  });

  it("answers false when the open file has no document controller", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(IMAGE);
    report("detailed-summary", true);
    const openInViewer = propsOf(entryNode("detailed-summary")).openInViewer as
      | ((target: { fileId: string; page?: number; section?: number }) => boolean)
      | undefined;
    expect(typeof openInViewer).toBe("function");

    let answer: boolean | undefined;
    act(() => {
      answer = openInViewer!({ fileId: "f1", page: 2 });
    });
    expect(answer).toBe(false);
  });
});

describe("SPEC-CORE-132 I12 - nothing here writes storage", () => {
  it("reporting, selecting, select() and openInViewer write neither localStorage nor sessionStorage", async () => {
    claimSlot("document-side", [DETAIL]);
    await renderKind(PDF);
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      writes.push(`set ${key}`);
      return setItem.call(this, key, value);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      writes.push(`remove ${key}`);
      return removeItem.call(this, key);
    });

    report("detailed-summary", true);
    fireEvent.click(screen.getByRole("tab", { name: DETAIL_LABEL }));
    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    callSelect("detailed-summary");
    const openInViewer = propsOf(entryNode("detailed-summary")).openInViewer as (
      target: { fileId: string; page?: number },
    ) => boolean;
    act(() => {
      openInViewer({ fileId: "other0000001", page: 1 });
    });

    expect(selectedTab()).toBe(DETAIL_LABEL);
    expect(writes).toEqual([]);
  });
});
