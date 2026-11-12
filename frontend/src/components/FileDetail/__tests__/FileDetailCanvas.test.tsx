import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import type { FileItem } from "@/types";
import { FILE_CHAPTERS_UPDATED_EVENT } from "@/lib/addonEvents";
import {
  claimSlot,
  loaded,
  makeFile,
  relationMocks,
  setApiResponses,
  slotMocks,
  usePolicyMock,
  withRelations,
} from "./harness";
import {
  entryNode,
  panelCard,
  shownPanels,
  storePanels,
  toggleLabels,
} from "./workbenchHelpers";

const TRANSCRIPT = {
  id: "transcript",
  label: "Transcript",
  priority: 10,
  addonName: "intelligence",
};
const TIE = { id: "tie", label: "Tie", priority: 50, addonName: "other" };

// `vi.mock` has to stay in this file because it is hoisted per file.

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
// Both exports: `ShellLayout` takes `SlotEntryRenderer` by name, and a
// missing one fails only as `Element type is invalid` once a suite claims
// a `player-side` entry.
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("../../markdown/MarkdownDocumentLayout", async () => ({
  MarkdownDocumentLayout: (await import("./harness"))
    .MarkdownDocumentLayoutStub,
}));
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

/**
 * The collection-playback route's layout (`?collection=` or `?folder_play=1`).
 * It has no inspector, so every available panel is a workbench panel.
 */
describe("FileDetailContent workbench (collection route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
    slotMocks.entries.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty("--app-header-h");
  });

  async function renderFile(file: FileItem) {
    setApiResponses(file);
    const utils = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    return utils;
  }

  function chaptersLoaded() {
    for (const button of screen.queryAllByTestId("chapters-resolved-some")) {
      fireEvent.click(button);
    }
  }

  it.each([
    ["a PDF", "application/pdf"],
    ["an EPUB", "application/epub+zip"],
  ])("keeps %s in its card: nothing bleeds it here", async (_name, mime_type) => {
    const { container } = await renderFile(makeFile({ file_type: "document", mime_type }));
    expect(container.querySelector("[data-bleed]")).toBeNull();
  });

  it("draws no row when no panel is available", async () => {
    const { container } = await renderFile(makeFile());

    expect(screen.queryByTestId("addon-slot-player-side")).toBeNull();
    expect(container.querySelector(".media-detail-grid")).toBeNull();
    expect(toggleLabels()).toBeNull();
  });

  it("draws the player, the row and the panels in one column", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    const { container } = await renderFile(makeFile());

    expect(
      container.querySelector(
        ".media-detail-player > [data-testid='file-preview']",
      ),
    ).not.toBeNull();
    expect(container.querySelector(".media-detail-grid")).toBeNull();
    expect(container.querySelector(".media-detail-workbench")).not.toBeNull();
    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("publishes both height budgets without a panel and recomputes them", async () => {
    let resize: (() => void) | undefined;
    class ResizeObserverMock {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("innerHeight", 676);
    document.documentElement.style.setProperty("--app-header-h", "64px");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = this.classList.contains("media-detail-player") ? 120 : 0;
        return {
          x: 0,
          y: top,
          top,
          right: 0,
          bottom: top,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      },
    );

    const { container } = await renderFile(makeFile());
    const host = container.querySelector<HTMLElement>(".media-detail-host");
    await waitFor(() => {
      expect(host?.style.getPropertyValue("--rail-top")).toBe(
        "var(--app-header-h, 0px)",
      );
      expect(host?.style.getPropertyValue("--rail-avail")).toBe("612px");
      expect(host?.style.getPropertyValue("--player-avail")).toBe("508px");
    });

    vi.stubGlobal("innerHeight", 800);
    act(() => resize?.());
    await waitFor(() =>
      expect(host?.style.getPropertyValue("--player-avail")).toBe("632px"),
    );
    expect(host?.style.getPropertyValue("--rail-avail")).toBe("736px");
  });

  it("keeps the height budgets exact in a self-scrolling pane", async () => {
    let resize: (() => void) | undefined;
    class ResizeObserverMock {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const pane = document.createElement("div");
    let playerTop = 100;
    Object.defineProperty(pane, "clientHeight", {
      configurable: true,
      value: 500,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = this === pane
          ? 50
          : this.classList.contains("media-detail-player")
            ? playerTop
            : 0;
        return {
          x: 0,
          y: top,
          top,
          right: 0,
          bottom: top,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      },
    );
    slotMocks.occupied.add("player-side");
    setApiResponses(makeFile());
    const { container } = render(
      <FileDetailContent
        fileId="f1"
        drive="main"
        miniPlayerRoot={pane}
        surface="collection"
      />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");

    const host = container.querySelector<HTMLElement>(".media-detail-host");
    await waitFor(() => {
      expect(host?.style.getPropertyValue("--rail-top")).toBe("0px");
      expect(host?.style.getPropertyValue("--rail-avail")).toBe("500px");
      expect(host?.style.getPropertyValue("--player-avail")).toBe("402px");
    });
    expect(resize).toBeDefined();

    // A resize after scrolling must use the player's content coordinate,
    // not its now-negative viewport coordinate.
    pane.scrollTop = 500;
    playerTop = -400;
    act(() => resize?.());
    await waitFor(() =>
      expect(host?.style.getPropertyValue("--player-avail")).toBe("402px"),
    );
  });

  it("gives video the workbench under the player", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    const { container } = await renderFile(makeFile());

    expect(container.querySelector(".media-detail-grid")).toBeNull();
    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("marks video and .loft as framed, and nothing else", async () => {
    const framed = async (file: FileItem) => {
      const { container, unmount } = await renderFile(file);
      const wrapper = container.querySelector<HTMLElement>(
        ".media-detail-player",
      );
      expect(wrapper).not.toBeNull();
      const value = wrapper!.dataset.framed;
      unmount();
      return value;
    };

    expect(await framed(makeFile())).toBe("true");
    expect(
      await framed(makeFile({ filename: "clip.loft", mime_type: "application/x-loft" })),
    ).toBe("true");
    expect(
      await framed(makeFile({ file_type: "image", filename: "a.jpg", mime_type: "image/jpeg" })),
    ).toBeUndefined();
    expect(
      await framed(makeFile({ file_type: "audio", filename: "a.mp3", mime_type: "audio/mpeg" })),
    ).toBeUndefined();
    expect(
      await framed(makeFile({ file_type: "document", filename: "a.pdf", mime_type: "application/pdf" })),
    ).toBeUndefined();
  });

  it("gives .loft the workbench under the player even though its file_type is video", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    const { container } = await renderFile(
      makeFile({
        filename: "clip.loft",
        mime_type: "application/vnd.litloft.loft+json",
      }),
    );

    expect(container.querySelector(".media-detail-grid")).toBeNull();
    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("gives audio the workbench instead of a rail", async () => {
    // The audio player is ~200px tall; a column beside it would leave
    // half the width empty.
    claimSlot("player-side", [TRANSCRIPT]);
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    expect(container.querySelector(".media-detail-grid")).toBeNull();
    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("places the audio panels directly below the player", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    withRelations(1);
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    const order = Array.from(
      container.querySelectorAll(
        "[data-testid='file-preview'], [role='group'], [data-testid='related-panel']",
      ),
    ).map((el) => el.getAttribute("data-testid") ?? "panels");

    expect(order).toEqual(["file-preview", "panels", "related-panel"]);
  });

  it("gives Chapters a toggle on a file that has them", async () => {
    const { container } = await renderFile(makeFile({ has_chapters: true }));
    chaptersLoaded();

    expect(toggleLabels()).toEqual(["Chapters"]);
    expect(container.querySelector(".media-detail-grid")).toBeNull();
  });

  it("orders the Chapters toggle ahead of a slot entry of equal priority", async () => {
    claimSlot("player-side", [TIE]);
    await renderFile(makeFile({ has_chapters: true }));
    chaptersLoaded();

    expect(toggleLabels()).toEqual(["Chapters", "Tie"]);
  });

  it("leaves the Chapters toggle out for a file with none", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(makeFile());

    expect(toggleLabels()).toEqual(["Transcript"]);
    expect(toggleLabels()).not.toContain("Chapters");
  });

  it("keeps the Chapters toggle through a mutation that answers without has_chapters", async () => {
    // like / dislike / favourite / metadata / rename all reply with the
    // plain FileResponse, which has no `has_chapters`.
    await renderFile(makeFile({ has_chapters: true }));
    chaptersLoaded();
    expect(toggleLabels()).toEqual(["Chapters"]);

    (api.likeFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFile({ liked_at: "2026-09-01T00:00:00Z", title: "Sample (liked)" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as liked" }));
    expect(await screen.findByText("Sample (liked)")).toBeInTheDocument();

    expect(toggleLabels()).toEqual(["Chapters"]);
  });

  it("mounts the chapters panel as a hidden item before it has anything", async () => {
    const { container } = await renderFile(makeFile({ has_chapters: false }));
    expect(screen.queryByTestId("chapters-panel")).not.toBeNull();
    expect(
      screen.getByTestId("chapters-panel").closest("[hidden]"),
    ).not.toBeNull();
    expect(container.querySelector(".media-detail-workbench")).not.toBeNull();
  });

  it("refreshes an already-mounted chapter panel after promotion", async () => {
    await renderFile(makeFile({ has_chapters: true }));
    expect(screen.getByTestId("chapters-panel")).toHaveAttribute(
      "data-refresh-token",
      "0",
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(FILE_CHAPTERS_UPDATED_EVENT, {
          detail: { fileId: "f1" },
        }),
      );
    });

    expect(screen.getByTestId("chapters-panel")).toHaveAttribute(
      "data-refresh-token",
      "1",
    );
  });

  it("takes the Chapters toggle away when the chapters turn out to be unreadable", async () => {
    await renderFile(makeFile({ has_chapters: true }));
    chaptersLoaded();
    expect(toggleLabels()).toEqual(["Chapters"]);

    fireEvent.click(screen.getByTestId("chapters-resolved-empty"));

    expect(toggleLabels()).toBeNull();
  });

  it("keeps a slot entry's toggle when the chapters fail", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(makeFile({ has_chapters: true }));
    chaptersLoaded();
    expect(toggleLabels()).toEqual(["Transcript", "Chapters"]);

    fireEvent.click(screen.getByTestId("chapters-resolved-empty"));

    expect(toggleLabels()).toEqual(["Transcript"]);
  });

  it("gives a shown slot entry a body that carries the height", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(makeFile({ has_chapters: true }));

    const entry = entryNode("transcript");
    expect(entry).toHaveAttribute("data-fill-height", "true");
    expect(panelCard("Transcript")).toContainElement(entry);
    expect(shownPanels()).toEqual(["Transcript"]);
  });

  it("draws no workbench for a file no player plays", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    const { container } = await renderFile(
      makeFile({ filename: "photo.jpg", file_type: "image", mime_type: "image/jpeg" }),
    );

    expect(container.querySelector(".media-detail-workbench")).toBeNull();
    expect(screen.queryAllByTestId("slot-entry-transcript")).toHaveLength(0);
  });

  it("always asks the occupant to fill, because the host always bounds", async () => {
    claimSlot("player-side", [TRANSCRIPT]);

    const video = await renderFile(makeFile());
    expect(entryNode("transcript")).toHaveAttribute("data-fill-height", "true");
    video.unmount();

    await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );
    expect(entryNode("transcript")).toHaveAttribute("data-fill-height", "true");
  });
});

describe("FileDetailContent layout toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
    slotMocks.entries.clear();
    document.documentElement.removeAttribute("data-media-layout");
    window.localStorage.clear();
  });

  async function renderFile(file: FileItem) {
    setApiResponses(file);
    const utils = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    return utils;
  }

  const toggle = () =>
    screen.queryByRole("button", { name: /transcript (beside|below) the player/i });

  it("offers no swap for a video with an occupant", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(makeFile());
    expect(toggle()).toBeNull();
  });

  it("offers no swap for audio, which never had a rail", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );
    expect(toggle()).toBeNull();
  });

  it("offers no swap when no panel is available", async () => {
    await renderFile(makeFile());
    expect(toggle()).toBeNull();
  });

  it("offers no swap for a chapters-only file", async () => {
    await renderFile(makeFile({ has_chapters: true }));
    expect(toggle()).toBeNull();
  });

  it("neither reads nor writes the old preference, and removes no stored value", async () => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    claimSlot("player-side", [TRANSCRIPT]);
    await renderFile(makeFile());

    expect(document.documentElement.hasAttribute("data-media-layout")).toBe(
      false,
    );
    expect(window.localStorage.getItem("media-layout-preference")).toBe(
      "stacked",
    );
  });

  it("draws the workbench instead of moving the panel between forms", async () => {
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(makeFile());

    expect(shownPanels()).toEqual(["Transcript"]);
  });
});

describe("FileDetailContent workbench width", () => {
  // Measured rather than a container query: on iOS Safari a containment
  // context around a <video> or cross-origin iframe renders the subtree
  // rotated and spinning.
  let resizeCallbacks: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
    slotMocks.entries.clear();
    document.documentElement.removeAttribute("data-media-layout");
    resizeCallbacks = [];
    class ResizeObserverMock {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderAtWidth(width: number) {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    setApiResponses(makeFile());
    const { container } = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    const host = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(
        "[data-workbench-width]",
      );
      expect(found).not.toBeNull();
      return found!;
    });
    return host;
  }

  it("calls a workbench with room for both columns wide", async () => {
    // 41rem at the 16px default root size.
    const host = await renderAtWidth(656);
    expect(host.dataset.workbenchWidth).toBe("wide");
  });

  it("calls a workbench one pixel short of that narrow", async () => {
    const host = await renderAtWidth(655);
    expect(host.dataset.workbenchWidth).toBe("narrow");
  });

  it("re-measures when the workbench is resized", async () => {
    const host = await renderAtWidth(655);
    expect(host.dataset.workbenchWidth).toBe("narrow");

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    act(() => {
      for (const callback of resizeCallbacks) callback();
    });
    await waitFor(() => expect(host.dataset.workbenchWidth).toBe("wide"));
  });

  it("measures a workbench that only appears once the file resolves", async () => {
    // `getFile` routinely wins the race against the addon catalogue, so
    // the workbench mounts on a later commit than the measuring effect.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    setApiResponses(makeFile());
    const { container } = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");

    const host = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(
        "[data-workbench-width]",
      );
      expect(found).not.toBeNull();
      return found!;
    });
    expect(host.dataset.workbenchWidth).toBe("wide");
  });

  it("scales the threshold with the root font size", async () => {
    // 41rem at a 20px root is 820px, so 800 is no longer enough.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        element === document.documentElement
          ? ({ fontSize: "20px", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration)
          : ({ fontSize: "16px", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration)) as typeof window.getComputedStyle,
    );
    const host = await renderAtWidth(800);
    expect(host.dataset.workbenchWidth).toBe("narrow");
  });
});

describe("the collection route and its relations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
    slotMocks.entries.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws the relations under one heading, without tabs", async () => {
    withRelations(2);
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" surface="collection" />);
    await loaded();

    expect(screen.getByRole("heading", { level: 2, name: "Related" })).toBeInTheDocument();
    expect(screen.getByTestId("related-panel")).toHaveAttribute("data-count", "2");
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
  });

  it("reaches an addon's derived relations for a file with none of its own", async () => {
    claimSlot("file-relations", [
      { id: "derived", label: "Derived", priority: 10, addonName: "some-addon" },
    ]);
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" surface="collection" />);
    await loaded();

    expect(screen.getByTestId("related-panel")).toHaveAttribute("data-count", "0");
    expect(screen.getByRole("heading", { level: 2, name: "Related" })).toBeInTheDocument();
  });

  it("draws nothing where there is nothing related", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" surface="collection" />);
    await loaded();

    expect(screen.queryByTestId("related-panel")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Related" })).toBeNull();
  });
});

