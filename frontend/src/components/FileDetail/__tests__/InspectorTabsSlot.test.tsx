import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import type { SlotEntry } from "@/lib/addons";
import {
  claimSlot,
  loaded,
  makeFile,
  publishedPdfState,
  relationMocks,
  setApiResponses,
  setViewport,
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
const EPUB = {
  mime_type: "application/epub+zip",
  file_type: "document" as const,
  filename: "book.epub",
};
const VIDEO = {
  mime_type: "video/mp4",
  file_type: "video" as const,
  filename: "clip.mp4",
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

const KINDS: [string, Partial<FileItem>][] = [
  ["a PDF", PDF],
  ["an EPUB", EPUB],
  ["a video", VIDEO],
  ["a Markdown note", MARKDOWN],
  ["an HTML preview", HTML],
];

const ASK: SlotEntry = {
  id: "ask",
  label: "Ask",
  i18n_key: "intelligence.tabs.ask",
  priority: 10,
  addonName: "intelligence",
};

const TRANSCRIPT: SlotEntry = {
  id: "transcript",
  label: "Transcript",
  i18n_key: "intelligence.tabs.transcript",
  priority: 90,
  addonName: "intelligence",
};

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  publishedPdfState.value = null;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-media-layout");
  setViewport();
});

async function renderKind(kind: Partial<FileItem>) {
  setApiResponses(
    makeFile({
      description: "Recorded on location.",
      has_chapters: false,
      ...kind,
    }),
  );
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await loaded();
  return utils;
}

const tabs = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent?.trim());

function entryNode(id: string, addon = "intelligence"): HTMLElement {
  const found = screen
    .queryAllByTestId(`slot-entry-${id}`)
    .find((node) => node.getAttribute("data-addon") === addon);
  if (!found) throw new Error(`no mounted entry ${addon}/${id}`);
  return found;
}

function report(id: string, available: boolean, addon = "intelligence") {
  const node = entryNode(id, addon);
  fireEvent.click(
    within(node).getByTestId(
      `slot-entry-${id}-${available ? "filled" : "empty"}`,
    ),
  );
}

function propsOf(node: Element): Record<string, unknown> {
  const props = slotPropsByNode.get(node);
  if (!props) throw new Error("the entry was not rendered through the harness");
  return props;
}

describe("SPEC-CORE-036 I10 - an inspector-tabs entry is a tab on every file page with an inspector", () => {
  it.each(KINDS)(
    "%s lists it after Info once it reports available",
    async (_name, kind) => {
      claimSlot("inspector-tabs", [ASK]);
      await renderKind(kind);

      // Silence is unavailable on this slot: nothing has been claimed yet.
      expect(tabs()).toEqual([]);
      report("ask", true);

      expect(tabs()).toEqual(["Info", "Ask"]);
    },
  );

  it("lists it after the core tabs", async () => {
    publishedPdfState.value = { numPages: 225, outline: [] };
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(PDF);
    report("ask", true);

    expect(tabs()).toEqual(["Info", "Pages", "Ask"]);
  });

  it("lists it after the player-side tabs, whatever the priorities say", async () => {
    // The player-side entry's priority is higher than the inspector-tabs
    // entry's, so a host that merged the two slots into one sorted list
    // would put Ask first.
    claimSlot("player-side", [TRANSCRIPT]);
    claimSlot("inspector-tabs", [{ ...ASK, priority: 1 }]);
    await renderKind({ ...VIDEO, has_chapters: true });

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript"]);
    report("ask", true);

    expect(tabs()).toEqual(["Info", "Chapters", "Transcript", "Ask"]);
  });

  it("lists Related among the core tabs, before the inspector-tabs entry", async () => {
    withRelations(1);
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(VIDEO);
    report("ask", true);

    expect(tabs()).toEqual(["Info", "Related", "Ask"]);
  });

  it("hands the entry the player-side tab props", async () => {
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(VIDEO);
    report("ask", true);

    const node = entryNode("ask");
    expect(node).toHaveAttribute("data-fill-height", "true");
    expect(node).toHaveAttribute("data-labelled-by-host", "true");
    expect(typeof propsOf(node).onAvailability).toBe("function");
  });
});

describe("SPEC-CORE-036 I10 - an inspector-tabs entry that has not reported is unavailable", () => {
  it("keeps it mounted, with no button, until it answers", async () => {
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(PDF);

    const before = entryNode("ask");
    expect(tabs()).not.toContain("Ask");

    report("ask", false);
    expect(tabs()).not.toContain("Ask");
    expect(entryNode("ask")).toBe(before);

    report("ask", true);
    expect(tabs()).toEqual(["Info", "Ask"]);
  });

  it.each(KINDS)("%s draws no tab for an entry that stays silent", async (_name, kind) => {
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(kind);

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(entryNode("ask")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-036 I10 - an id shared with another slot or a core tab does not collide", () => {
  const PLAYER_ASK: SlotEntry = {
    ...TRANSCRIPT,
    id: "ask",
    label: "Player Ask",
    addonName: "player-addon",
  };

  it("keys availability by slot when the id matches a player-side entry", async () => {
    claimSlot("player-side", [PLAYER_ASK]);
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(VIDEO);

    // The player-side entry is silent, and silence means available there.
    expect(tabs()).toEqual(["Info", "Player Ask"]);
    report("ask", true);
    expect(tabs()).toEqual(["Info", "Player Ask", "Ask"]);

    // Saying no for one slot's entry must not take the other one's tab.
    report("ask", false);
    expect(tabs()).toEqual(["Info", "Player Ask"]);

    report("ask", true);
    report("ask", false, "player-addon");
    expect(tabs()).toEqual(["Info", "Ask"]);
  });

  it("gives two entries with the same id their own tab and panel ids", async () => {
    claimSlot("player-side", [PLAYER_ASK]);
    claimSlot("inspector-tabs", [ASK]);
    await renderKind(VIDEO);
    report("ask", true);

    const tabButtons = screen.getAllByRole("tab");
    expect(tabButtons).toHaveLength(3);
    const ids = tabButtons.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
    const controlled = tabButtons.map((tab) =>
      tab.getAttribute("aria-controls"),
    );
    expect(new Set(controlled).size).toBe(controlled.length);
    for (const panel of controlled) {
      expect(document.getElementById(panel!)).not.toBeNull();
    }
  });

  it("keeps a core Pages tab when an inspector-tabs entry shares its id", async () => {
    publishedPdfState.value = { numPages: 225, outline: [] };
    claimSlot("inspector-tabs", [{ ...ASK, id: "pages", label: "Pages" }]);
    await renderKind(PDF);

    expect(tabs()).toEqual(["Info", "Pages"]);
    report("pages", true);
    expect(tabs()).toEqual(["Info", "Pages", "Pages"]);

    const tabButtons = screen.getAllByRole("tab");
    const ids = tabButtons.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);

    report("pages", false);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByTestId("pdf-pages-tab")).toBeInTheDocument();
    // The addon's own panel is still mounted, so it can report again.
    expect(entryNode("pages")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-036 I10 - the collection surface draws no inspector tab", () => {
  it.each<[string, Partial<FileItem>]>([
    ["a PDF", PDF],
    ["a video", VIDEO],
    ["a Markdown note", MARKDOWN],
  ])("%s: listed on the file page, gone on the collection surface", async (_name, kind) => {
    claimSlot("inspector-tabs", [ASK]);
    const { rerender } = await renderKind(kind);
    report("ask", true);
    expect(tabs()).toContain("Ask");

    setApiResponses(
      makeFile({ has_chapters: false, description: "", ...kind }),
    );
    rerender(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();

    expect(tabs()).not.toContain("Ask");
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
  });
});

describe("SPEC-CORE-036 I12 - player-side keeps its order and its silence", () => {
  it("orders player-side tabs by priority", async () => {
    claimSlot("player-side", [
      { ...TRANSCRIPT, id: "late", label: "Late", priority: 90 },
      { ...TRANSCRIPT, id: "early", label: "Early", priority: 10 },
    ]);
    await renderKind({ ...VIDEO, has_chapters: true });

    expect(tabs()).toEqual(["Info", "Chapters", "Early", "Late"]);
  });

  it("lists a player-side entry that never reported", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderKind(VIDEO);

    expect(tabs()).toEqual(["Info", "Transcript"]);
  });

  it("takes a player-side tab away when its entry says it has nothing", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderKind(VIDEO);
    report("transcript", false);

    expect(tabs()).toEqual([]);
    expect(entryNode("transcript")).toBeInTheDocument();
  });
});
