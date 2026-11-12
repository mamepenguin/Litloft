/**
 * SPEC-CORE-083: on a non-phone viewport, a player file in a row too narrow
 * for the inspector beside the canvas stacks the inspector under the player
 * instead of laying it over the video, and its inspector starts open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";
import {
  claimSlot,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
  slotMocks,
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

const TRANSCRIPT = {
  id: "transcript",
  label: "Transcript",
  priority: 10,
  addonName: "intelligence",
};

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

/** Narrow: under 60.5rem (968px). Wide: the row holds both. */
const NARROW_ROW = 900;
const WIDE_ROW = 1200;
const ROW_HEIGHT = 700;

let rowWidth = NARROW_ROW;
let resizeCallbacks: Array<() => void> = [];

function resizeRowTo(width: number) {
  rowWidth = width;
  act(() => {
    for (const cb of resizeCallbacks) cb();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-media-layout");
  // A tablet: not a phone, and under the 1120px viewport default.
  setViewport(1024);
  rowWidth = NARROW_ROW;
  resizeCallbacks = [];
  class ResizeObserverMock {
    constructor(callback: () => void) {
      resizeCallbacks.push(() => callback());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => rowWidth,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => (rowWidth === 0 ? 0 : ROW_HEIGHT),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function storeOpen(open: boolean) {
  window.localStorage.setItem(inspectorOpenStorageKey("main"), String(open));
}

async function renderFile(file: FileItem = VIDEO) {
  setApiResponses(file);
  const utils = render(<FileDetailContent fileId={file.id} drive="main" />);
  await shellLoaded();
  return utils;
}

const fit = () => screen.getByTestId("inspector-fit-host").dataset.inspectorFit;
const pane = () => screen.queryByTestId("inspector-pane");
const infoPanel = () => document.getElementById("inspector-panel-info");
const tabs = () => screen.queryAllByRole("tab").map((t) => t.textContent?.trim());
const layoutToggle = () =>
  screen.queryByRole("button", { name: /transcript (beside|below) the player/i });

/** The lucide icon the chrome row's inspector button draws. */
function toggleIcon(): string | null {
  const svg = screen.getByTestId("inspector-toggle").querySelector("svg");
  if (!svg) return null;
  const known = [
    "lucide-panel-bottom-close",
    "lucide-panel-bottom",
    "lucide-panel-right-close",
    "lucide-panel-right",
  ];
  return known.find((name) => svg.classList.contains(name)) ?? null;
}

describe("SPEC-CORE-083 083.1 the form the row computes", () => {
  it("SPEC-CORE-083 I6 stacks a player file in a narrow row, keeps it beside in a wide one, and overlays a file without a player", async () => {
    storeOpen(true);
    const rows: Array<{
      name: string;
      file: FileItem;
      row: number;
      viewport: number;
      form: string;
    }> = [
      { name: "video, one px short", file: VIDEO, row: 967, viewport: 1024, form: "stacked" },
      { name: "video, at the threshold", file: VIDEO, row: 968, viewport: 1024, form: "beside" },
      { name: "image, narrow", file: IMAGE, row: 967, viewport: 1024, form: "overlay" },
      { name: "image, wide", file: IMAGE, row: 968, viewport: 1024, form: "beside" },
      // The phone boundary: below 768 the attribute is written as today.
      { name: "video, narrow, at 768", file: VIDEO, row: 700, viewport: 768, form: "stacked" },
      { name: "video, narrow, phone at 767", file: VIDEO, row: 700, viewport: 767, form: "overlay" },
    ];
    for (const { name, file, row, viewport, form } of rows) {
      rowWidth = row;
      setViewport(viewport);
      const { unmount } = await renderFile(file);
      await waitFor(() => expect({ name, form: fit() }).toEqual({ name, form }));
      unmount();
    }
  });

  it("SPEC-CORE-083 moves a player file between beside and stacked as the row is resized", async () => {
    storeOpen(true);
    rowWidth = WIDE_ROW;
    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("beside"));

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");

    resizeRowTo(WIDE_ROW);
    expect(fit()).toBe("beside");
  });

  it("SPEC-CORE-083 never changes the form by opening or closing the inspector", async () => {
    storeOpen(true);
    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("stacked"));

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(pane()).toBeNull();
    expect(fit()).toBe("stacked");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(pane()).not.toBeNull();
    expect(fit()).toBe("stacked");
  });

  it("SPEC-CORE-083 publishes the row's height on the row", async () => {
    storeOpen(true);
    await renderFile(VIDEO);

    await waitFor(() =>
      expect(
        screen
          .getByTestId("inspector-fit-host")
          .style.getPropertyValue("--fit-row-h"),
      ).toBe(`${ROW_HEIGHT}px`),
    );
  });
});

describe("SPEC-CORE-083 083.6 the inspector's default open state", () => {
  it("SPEC-CORE-083 I6 starts a player file's inspector open below 1120px, without writing the stored value", async () => {
    for (const viewport of [768, 1024, 1119]) {
      setViewport(viewport);
      const { unmount } = await renderFile(VIDEO);
      expect({ viewport, open: pane() !== null }).toEqual({ viewport, open: true });
      expect(window.localStorage.getItem(inspectorOpenStorageKey("main"))).toBeNull();
      unmount();
    }
  });

  it("SPEC-CORE-083 I6 keeps a file without a player on the 1120px viewport default", async () => {
    // Paired with the player row so the difference is the file kind.
    const cases = [
      { file: VIDEO, viewport: 767, open: false },
      { file: IMAGE, viewport: 1024, open: false },
      { file: IMAGE, viewport: 1120, open: true },
      { file: VIDEO, viewport: 1024, open: true },
    ];
    for (const { file, viewport, open } of cases) {
      setViewport(viewport);
      const { unmount } = await renderFile(file);
      expect({ file: file.filename, viewport, open: pane() !== null }).toEqual({
        file: file.filename,
        viewport,
        open,
      });
      unmount();
    }
  });

  it("SPEC-CORE-083 I6 lets a stored closed state win over the player default", async () => {
    // Paired with the same file and viewport unstored, so the closed answer
    // comes from the stored value and not from the viewport.
    const unstored = await renderFile(VIDEO);
    expect(pane()).not.toBeNull();
    unstored.unmount();

    storeOpen(false);
    await renderFile(VIDEO);
    expect(pane()).toBeNull();
  });

  it("SPEC-CORE-083 I6 neither opens nor closes the inspector on a form change", async () => {
    rowWidth = WIDE_ROW;
    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("beside"));
    expect(pane()).not.toBeNull();

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");
    expect(pane()).not.toBeNull();

    resizeRowTo(WIDE_ROW);
    expect(pane()).not.toBeNull();
    expect(window.localStorage.getItem(inspectorOpenStorageKey("main"))).toBeNull();
  });
});

describe.each(["stacked", "beside"])(
  "SPEC-CORE-083 the stacked layout, with media-layout-preference %s",
  (preference) => {
    beforeEach(() => {
      window.localStorage.setItem("media-layout-preference", preference);
      storeOpen(true);
      claimSlot("player-side", [TRANSCRIPT]);
    });

    it("SPEC-CORE-083 I4 mounts every companion exactly once, as an inspector tab", async () => {
      const { container } = await renderFile(VIDEO);
      await waitFor(() => expect(fit()).toBe("stacked"));

      expect(tabs()).toEqual(expect.arrayContaining(["Info", "Chapters", "Transcript"]));
      const transcript = screen.getAllByTestId("slot-entry-transcript");
      const chapters = screen.getAllByTestId("chapters-panel");
      expect(transcript).toHaveLength(1);
      expect(chapters).toHaveLength(1);
      expect(pane()).toContainElement(transcript[0]);
      expect(pane()).toContainElement(chapters[0]);
      expect(container.querySelector(".media-detail-below")).toBeNull();
    });

    it("SPEC-CORE-083 I3 draws no layout toggle", async () => {
      await renderFile(VIDEO);
      await waitFor(() => expect(fit()).toBe("stacked"));

      expect(layoutToggle()).toBeNull();
    });

    it("SPEC-CORE-083 I3 puts the description in Info, not under the player", async () => {
      await renderFile(VIDEO);
      await waitFor(() => expect(fit()).toBe("stacked"));

      const description = screen.getAllByText(DESCRIPTION);
      expect(description).toHaveLength(1);
      expect(infoPanel()).toContainElement(description[0]);
    });

    it("SPEC-CORE-083 puts the summaries at the end of Info, once each", async () => {
      await renderFile(VIDEO);
      await waitFor(() => expect(fit()).toBe("stacked"));

      const summary = screen.getAllByTestId("active-summary-host");
      const detailed = screen.getAllByTestId("addon-slot-include:detailed-summary");
      expect(summary).toHaveLength(1);
      expect(detailed).toHaveLength(1);
      expect(infoPanel()).toContainElement(summary[0]);
      expect(infoPanel()).toContainElement(detailed[0]);
    });

    it("SPEC-CORE-083 I3 shows PanelBottomClose on the inspector button", async () => {
      await renderFile(VIDEO);
      await waitFor(() => expect(fit()).toBe("stacked"));

      expect(toggleIcon()).toBe("lucide-panel-bottom-close");
    });

    it("SPEC-CORE-083 I4 writes no media-layout-preference across a form change and an inspector toggle", async () => {
      rowWidth = WIDE_ROW;
      await renderFile(VIDEO);
      resizeRowTo(NARROW_ROW);
      expect(fit()).toBe("stacked");
      fireEvent.click(screen.getByTestId("inspector-toggle"));
      fireEvent.click(screen.getByTestId("inspector-toggle"));
      resizeRowTo(WIDE_ROW);

      expect(window.localStorage.getItem("media-layout-preference")).toBe(preference);
    });
  },
);

describe("SPEC-CORE-083 form stacked with the inspector closed is today's page", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    storeOpen(false);
    claimSlot("player-side", [TRANSCRIPT]);
  });

  it("SPEC-CORE-083 I3 I4 shows PanelBottom, the layout toggle, the description and the companion in the canvas", async () => {
    const { container } = await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("stacked"));

    expect(toggleIcon()).toBe("lucide-panel-bottom");
    expect(layoutToggle()).not.toBeNull();
    expect(container.querySelector("main")).toContainElement(
      screen.getByText(DESCRIPTION),
    );
    const below = container.querySelector(".media-detail-below");
    expect(below).not.toBeNull();
    expect(below).toContainElement(screen.getByTestId("slot-entry-transcript"));
  });

  it("SPEC-CORE-083 I2 keeps the same player element when the inspector opens and closes in stacked", async () => {
    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("stacked"));
    const player = screen.getByTestId("file-preview");

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await waitFor(() => expect(layoutToggle()).toBeNull());
    expect(screen.getByTestId("file-preview")).toBe(player);
    expect(infoPanel()).toContainElement(screen.getByText(DESCRIPTION));

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await waitFor(() => expect(layoutToggle()).not.toBeNull());
    expect(screen.getByTestId("file-preview")).toBe(player);
  });
});

describe("SPEC-CORE-083 083.7 the inspector button's icon in every form", () => {
  it("SPEC-CORE-083 I3 draws PanelBottom only in stacked, PanelRight in the other forms", async () => {
    const cases: Array<{
      name: string;
      file: FileItem;
      row: number;
      open: boolean;
      icon: string;
    }> = [
      { name: "stacked, open", file: VIDEO, row: NARROW_ROW, open: true, icon: "lucide-panel-bottom-close" },
      { name: "stacked, closed", file: VIDEO, row: NARROW_ROW, open: false, icon: "lucide-panel-bottom" },
      { name: "beside, open", file: VIDEO, row: WIDE_ROW, open: true, icon: "lucide-panel-right-close" },
      { name: "beside, closed", file: VIDEO, row: WIDE_ROW, open: false, icon: "lucide-panel-right" },
      { name: "overlay, open", file: IMAGE, row: NARROW_ROW, open: true, icon: "lucide-panel-right-close" },
      { name: "overlay, closed", file: IMAGE, row: NARROW_ROW, open: false, icon: "lucide-panel-right" },
    ];
    for (const { name, file, row, open, icon } of cases) {
      rowWidth = row;
      storeOpen(open);
      const { unmount } = await renderFile(file);
      await waitFor(() => expect({ name, icon: toggleIcon() }).toEqual({ name, icon }));
      unmount();
    }
  });
});

describe("SPEC-CORE-083 I2 a form change keeps what was mounted", () => {
  it("SPEC-CORE-083 I2 keeps the player, the pane, the Info panel and a tab listed on both sides", async () => {
    // Preference beside: the transcript is a tab on both sides of the crossing.
    window.localStorage.setItem("media-layout-preference", "beside");
    storeOpen(true);
    claimSlot("player-side", [TRANSCRIPT]);
    rowWidth = WIDE_ROW;
    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("beside"));
    const before = {
      player: screen.getByTestId("file-preview"),
      pane: screen.getByTestId("inspector-pane"),
      info: infoPanel(),
      transcript: screen.getByTestId("slot-entry-transcript"),
    };

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");

    expect(screen.getByTestId("file-preview")).toBe(before.player);
    expect(screen.getByTestId("inspector-pane")).toBe(before.pane);
    expect(infoPanel()).toBe(before.info);
    expect(screen.getByTestId("slot-entry-transcript")).toBe(before.transcript);
  });
});

describe("SPEC-CORE-083 083.8 the first frame of a player file", () => {
  beforeEach(() => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    storeOpen(true);
    claimSlot("player-side", [TRANSCRIPT]);
  });

  const deferred = () => ({
    description: screen.queryAllByText(DESCRIPTION).length,
    summary: screen.queryAllByTestId("active-summary-host").length,
    detailed: screen.queryAllByTestId("addon-slot-include:detailed-summary").length,
    transcript: screen.queryAllByTestId("slot-entry-transcript").length,
    chapters: screen.queryAllByTestId("chapters-panel").length,
  });

  it("SPEC-CORE-083 I5 mounts none of the description, summaries or companions before the row is measured", async () => {
    rowWidth = 0;
    await renderFile(VIDEO);

    expect(fit()).toBeUndefined();
    expect(deferred()).toEqual({
      description: 0,
      summary: 0,
      detailed: 0,
      transcript: 0,
      chapters: 0,
    });
  });

  it("SPEC-CORE-083 I5 mounts each once, in the place the first measured form gives", async () => {
    rowWidth = 0;
    await renderFile(VIDEO);

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");

    expect(deferred()).toEqual({
      description: 1,
      summary: 1,
      detailed: 1,
      transcript: 1,
      chapters: 1,
    });
    expect(infoPanel()).toContainElement(screen.getByText(DESCRIPTION));
    expect(pane()).toContainElement(screen.getByTestId("slot-entry-transcript"));
  });

  /**
   * Every element ever inserted is kept, with the ancestry it was inserted
   * under: React does not reparent DOM nodes, so a frame that drew one in the
   * canvas and then drew another in Info shows up as two insertions.
   */
  function watchInsertions() {
    const inserted = { transcript: [] as Element[], summary: [] as Element[] };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of Array.from(r.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const pick = (testId: string) => [
            ...(node.matches(`[data-testid="${testId}"]`) ? [node] : []),
            ...Array.from(node.querySelectorAll(`[data-testid="${testId}"]`)),
          ];
          inserted.transcript.push(...pick("slot-entry-transcript"));
          inserted.summary.push(...pick("active-summary-host"));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return {
      inserted,
      stop: () => {
        for (const r of observer.takeRecords()) {
          for (const node of Array.from(r.addedNodes)) {
            if (!(node instanceof Element)) continue;
            if (node.matches('[data-testid="slot-entry-transcript"]')) inserted.transcript.push(node);
            inserted.transcript.push(...Array.from(node.querySelectorAll('[data-testid="slot-entry-transcript"]')));
            if (node.matches('[data-testid="active-summary-host"]')) inserted.summary.push(node);
            inserted.summary.push(...Array.from(node.querySelectorAll('[data-testid="active-summary-host"]')));
          }
        }
        observer.disconnect();
      },
    };
  }

  const inInspector = (el: Element) => el.closest('[data-testid="inspector-pane"]') !== null;

  it("SPEC-CORE-083 I5 inserts each of them once, and only inside the inspector, while the first file opens", async () => {
    const watch = watchInsertions();

    await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("stacked"));
    watch.stop();

    expect(watch.inserted.transcript).toHaveLength(1);
    expect(watch.inserted.summary).toHaveLength(1);
    expect(watch.inserted.transcript.every(inInspector)).toBe(true);
    expect(watch.inserted.summary.every(inInspector)).toBe(true);
  });

  it("SPEC-CORE-083 I5 hands the next file no stale form from the previous one", async () => {
    // File A is measured beside; the row is narrowed without a resize, so the
    // only way B can be drawn beside is a form left over from A.
    const second = makeFile({
      id: "f2",
      has_chapters: true,
      description: DESCRIPTION,
      title: "Second",
    });
    rowWidth = WIDE_ROW;
    const utils = await renderFile(VIDEO);
    await waitFor(() => expect(fit()).toBe("beside"));

    rowWidth = NARROW_ROW;
    setApiResponses(second);
    const watch = watchInsertions();
    utils.rerender(<FileDetailContent fileId={second.id} drive="main" />);
    await waitFor(() => expect(screen.getAllByText("Second").length).toBeGreaterThan(0));
    await waitFor(() => expect(fit()).toBe("stacked"));
    watch.stop();

    expect(watch.inserted.summary.length).toBeGreaterThan(0);
    expect(watch.inserted.summary.every(inInspector)).toBe(true);
    expect(screen.getAllByTestId("active-summary-host")).toHaveLength(1);
    expect(infoPanel()).toContainElement(screen.getByText(DESCRIPTION));
  });
});
