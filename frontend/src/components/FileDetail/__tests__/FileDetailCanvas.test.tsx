import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import type { FileItem } from "@/types";
import { FILE_CHAPTERS_UPDATED_EVENT } from "@/lib/addonEvents";
import {
  loaded,
  makeFile,
  setApiResponses,
  slotMocks,
  usePolicyMock,
} from "./harness";

// Heavy children are mocked: these suites are about FileDetail's own
// contract, not about what the children render — those have their own
// tests. The stub bodies live in ./harness so the three suites that
// need the same set do not each carry a copy; `vi.mock` itself has to
// stay here, because it is hoisted per file.

vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../../RelatedFilesSection", async () => ({
  RelatedFilesSection: (await import("./harness")).RelatedFilesSectionStub,
}));
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
// Both exports: `ShellLayout` takes `SlotEntryRenderer` by name, so a
// factory that returns only `AddonSlot` leaves it `undefined`. It is
// harmless while no suite here claims a `player-side` entry, and the
// moment one does the failure is `Element type is invalid` pointing at
// nothing in particular.
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
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
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
 * The legacy vertical stack, which is the collection-playback route's
 * layout — `/files/{id}` with `?collection=` or `?folder_play=1`.
 *
 * It is not a leftover. The canonical URL is a file's address, so the
 * design deliberately did not give this route a second inspector, and
 * "not investing in a surface" is not the same as taking the rail it
 * already has off it. Every case below is therefore still shipped
 * behaviour; what changed in 2026-09 is only which surface it is on.
 */
describe("FileDetailContent companion region (collection route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty("--app-header-h");
  });

  function grid(container: HTMLElement) {
    return container.querySelector(".media-detail-grid");
  }

  async function renderFile(file: FileItem) {
    setApiResponses(file);
    const utils = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    return utils;
  }

  it("renders nothing at all when no addon claims the slot", async () => {
    const { container } = await renderFile(makeFile());

    // Not merely hidden: with no occupant the grid never appears, so
    // the page keeps exactly the layout it had before this existed.
    expect(screen.queryByTestId("addon-slot-player-side")).toBeNull();
    expect(grid(container)).toBeNull();
  });

  it("wraps the player on the no-companion, promoted, and grid branches", async () => {
    const noCompanion = await renderFile(makeFile());
    expect(
      noCompanion.container.querySelector(
        ".media-detail-player > .media-detail-player-frame > [data-testid='file-preview']",
      ),
    ).not.toBeNull();
    noCompanion.unmount();

    slotMocks.occupied.add("player-side");
    const promoted = await renderFile(
      makeFile({
        filename: "ep.mp3",
        file_type: "audio",
        mime_type: "audio/mpeg",
      }),
    );
    expect(
      promoted.container.querySelector(
        ".media-detail-player > .media-detail-player-frame > [data-testid='file-preview']",
      ),
    ).not.toBeNull();
    promoted.unmount();

    const gridLayout = await renderFile(makeFile());
    expect(
      gridLayout.container.querySelector(
        ".media-detail-grid .media-detail-player > .media-detail-player-frame > [data-testid='file-preview']",
      ),
    ).not.toBeNull();
  });

  it("publishes both height budgets without a companion and recomputes them", async () => {
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

  it("keeps the existing rail budgets exact in a self-scrolling pane", async () => {
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

  it("gives video the rail layout", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(makeFile());

    expect(screen.getByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
  });

  it("marks video and .loft as framed, and nothing else", async () => {
    // The theater width cap inverts a 16:9 ratio, so it is only
    // meaningful where the height follows the width. An image sizes
    // itself from `max-h-[70vh]`; a PDF or text preview has no ratio at
    // all. Capping their column would narrow them on a short window.
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

  it("gives .loft the rail layout even though its file_type is video", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({
        filename: "clip.loft",
        mime_type: "application/vnd.litloft.loft+json",
      }),
    );

    expect(grid(container)).not.toBeNull();
  });

  it("never gives audio the rail, but still shows the companion", async () => {
    // The audio player is ~200px tall; a column beside it would leave
    // half the width empty. It keeps the promoted position instead.
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    expect(screen.getByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).toBeNull();
  });

  it("places the audio companion directly below the player", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    const order = Array.from(
      container.querySelectorAll(
        "[data-testid='file-preview'], [data-testid='addon-slot-player-side'], [data-testid='related-files']",
      ),
    ).map((el) => el.getAttribute("data-testid"));

    expect(order).toEqual([
      "file-preview",
      "addon-slot-player-side",
      "related-files",
    ]);
  });

  // Spec 2026-08-11-media-chapters.md §6. Core is an occupant now, not
  // only the host, so "is anyone here" stopped being the same question
  // as "has an addon claimed the slot".
  it("gives the rail to a file with chapters and no addon occupant", async () => {
    const { container } = await renderFile(makeFile({ has_chapters: true }));

    expect(screen.getByTestId("chapters-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
  });

  it("puts chapters above the addon occupant, not behind a tab", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(makeFile({ has_chapters: true }));

    const order = Array.from(
      container.querySelectorAll(
        "[data-testid='chapters-panel'], [data-testid='addon-slot-player-side']",
      ),
    ).map((el) => el.getAttribute("data-testid"));

    expect(order).toEqual(["chapters-panel", "addon-slot-player-side"]);
  });

  it("leaves the panel out for a file with no chapters", async () => {
    slotMocks.occupied.add("player-side");
    await renderFile(makeFile());

    expect(screen.queryByTestId("chapters-panel")).toBeNull();
  });

  it("keeps the chapters through a mutation that answers without them", async () => {
    // like / dislike / favourite / metadata / rename all reply with the
    // plain FileResponse, which has no `has_chapters`. Storing that whole
    // object used to erase the flag, so liking a video made its chapters
    // vanish until the next reload.
    const { container } = await renderFile(makeFile({ has_chapters: true }));
    expect(grid(container)).not.toBeNull();

    // `makeFile` carries no `has_chapters` unless asked, which is exactly
    // the shape these endpoints answer with.
    //
    // The distinct title is a positive control for the merge. What could
    // erase the flag is the response being stored, not the request being
    // sent, so waiting on the mock having been called waits for the wrong
    // event — it happens to work only because the resolution lands inside
    // waitFor's first poll. The panel is already on screen from the initial
    // render, so if that timing ever went the other way this would pass
    // without the merge having happened, and say nothing. Waiting for the
    // new title waits for the merge itself.
    (api.likeFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFile({ liked_at: "2026-09-01T00:00:00Z", title: "Sample (liked)" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as liked" }));
    expect(await screen.findByText("Sample (liked)")).toBeInTheDocument();

    expect(screen.getByTestId("chapters-panel")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
  });

  it("mounts chapters immediately after an addon promotes them", async () => {
    const { container } = await renderFile(makeFile({ has_chapters: false }));
    expect(screen.queryByTestId("chapters-panel")).toBeNull();
    expect(grid(container)).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(FILE_CHAPTERS_UPDATED_EVENT, {
          detail: { fileId: "f1" },
        }),
      );
    });

    expect(screen.getByTestId("chapters-panel")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
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

  it("folds the region away when the chapters turn out to be unreadable", async () => {
    // The panel hiding itself is not enough when it is the only
    // occupant: the region would stay as an empty 24rem column with the
    // player squeezed beside it.
    const { container } = await renderFile(makeFile({ has_chapters: true }));
    expect(grid(container)).not.toBeNull();

    fireEvent.click(screen.getByTestId("chapters-resolved-empty"));

    expect(screen.queryByTestId("chapters-panel")).toBeNull();
    expect(grid(container)).toBeNull();
  });

  it("keeps the region when an addon occupies it and the chapters fail", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(makeFile({ has_chapters: true }));

    fireEvent.click(screen.getByTestId("chapters-resolved-empty"));

    expect(screen.queryByTestId("chapters-panel")).toBeNull();
    expect(screen.getByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
  });

  it("gives the slot a wrapper that carries the height on", async () => {
    // The wrapper C-1 avoided. It is only safe because it is itself a
    // flex container in the chain; if it ever stops being one the
    // transcript lays itself out at full length and gets clipped.
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(makeFile({ has_chapters: true }));

    const slot = screen.getByTestId("addon-slot-player-side");
    expect(slot.parentElement).toHaveClass("media-detail-companion-fill");
    expect(
      container.querySelector(".media-detail-companion-fill"),
    ).not.toBeNull();
  });

  it("offers no companion for a file no player plays", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "photo.jpg", file_type: "image", mime_type: "image/jpeg" }),
    );

    expect(screen.queryByTestId("addon-slot-player-side")).toBeNull();
    expect(grid(container)).toBeNull();
  });

  it("always asks the occupant to fill, because the host always bounds", async () => {
    // Deciding this by file kind was wrong: which form is in use is a
    // container-width question answered in CSS, so a video in a narrow
    // pane got the fill treatment with nothing bounding it and the
    // occupant ran to full length. The host now holds the height in
    // both forms and the occupant simply fills what it is given.
    slotMocks.occupied.add("player-side");

    const video = await renderFile(makeFile());
    expect(
      screen.getByTestId("addon-slot-player-side").getAttribute("data-fill-height"),
    ).toBe("true");
    video.unmount();

    await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );
    expect(
      screen.getByTestId("addon-slot-player-side").getAttribute("data-fill-height"),
    ).toBe("true");
  });
});

// Spec 2026-08-11-media-layout-toggle.md §2. Whether the button is
// *visible* is a container query (untestable here); whether it is
// rendered at all is the host's decision and is.
describe("FileDetailContent layout toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
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

  it("offers the swap for a video with an occupant", async () => {
    slotMocks.occupied.add("player-side");
    await renderFile(makeFile());
    expect(toggle()).toBeInTheDocument();
  });

  it("offers nothing for audio, which never gets the rail", async () => {
    slotMocks.occupied.add("player-side");
    await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );
    expect(toggle()).toBeNull();
  });

  it("offers nothing when no addon claims the slot", async () => {
    await renderFile(makeFile());
    expect(toggle()).toBeNull();
  });

  it("offers the swap for a chapters-only file, with no addon at all", async () => {
    // The toggle gates placement, not occupancy. Tying it to `hasSlot`
    // alone would leave a rail the viewer cannot put back.
    await renderFile(makeFile({ has_chapters: true }));
    expect(toggle()).toBeInTheDocument();
  });

  it("flips the attribute the layout is driven by", async () => {
    slotMocks.occupied.add("player-side");
    await renderFile(makeFile());

    // Starts at the default, so the first press is the one that leaves it.
    fireEvent.click(toggle()!);
    expect(document.documentElement.getAttribute("data-media-layout")).toBe("stacked");

    fireEvent.click(toggle()!);
    expect(document.documentElement.getAttribute("data-media-layout")).toBe("beside");
  });
});

describe("FileDetailContent rail width", () => {
  // The rail form used to be selected by a container query. `@container`
  // establishes a containment context, and on iOS Safari one wrapped
  // around a <video> or a cross-origin iframe renders the whole subtree
  // rotated and spinning (confirmed on device 2026-08-12, invisible on
  // desktop). The width question is unchanged — this surface renders
  // both full-width and inside the 2-pane right pane — so it is now
  // measured and published as an attribute instead.
  //
  // Which is also why these assertions can exist at all: jsdom does not
  // evaluate container queries, but it does have attributes.
  let resize: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
    slotMocks.occupied.add("player-side");
    document.documentElement.removeAttribute("data-media-layout");
    resize = undefined;
    class ResizeObserverMock {
      constructor(callback: () => void) {
        resize = callback;
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
      const found = container.querySelector<HTMLElement>("[data-media-width]");
      expect(found).not.toBeNull();
      return found!;
    });
    return host;
  }

  it("calls a host with room for both columns wide", async () => {
    // 60rem at the 16px default root size.
    const host = await renderAtWidth(960);
    expect(host.dataset.mediaWidth).toBe("wide");
  });

  it("calls a host one pixel short of that narrow", async () => {
    const host = await renderAtWidth(959);
    expect(host.dataset.mediaWidth).toBe("narrow");
  });

  it("re-measures when the host is resized", async () => {
    const host = await renderAtWidth(959);
    expect(host.dataset.mediaWidth).toBe("narrow");

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    resize?.();
    await waitFor(() => expect(host.dataset.mediaWidth).toBe("wide"));
  });

  it("measures a wrapper that only appears once an addon claims the slot", async () => {
    // `getFile` routinely wins the race against the addon catalogue, so
    // the wrapper mounts on a later commit than the one the measuring
    // effect ran on. A dependency list would have to name every reason
    // it can appear; the callback ref does not care which one it was.
    slotMocks.occupied.clear();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    setApiResponses(makeFile());
    const { container, rerender } = render(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    expect(container.querySelector("[data-media-width]")).toBeNull();

    slotMocks.occupied.add("player-side");
    rerender(
      <FileDetailContent fileId="f1" drive="main" surface="collection" />,
    );

    const host = await waitFor(() => {
      const found = container.querySelector<HTMLElement>("[data-media-width]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(host.dataset.mediaWidth).toBe("wide");
  });

  it("scales the threshold with the root font size", async () => {
    // 60rem at a 20px root is 1200px, so 960 is no longer enough. The
    // rail and player minimums the number came from are in rem too.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        element === document.documentElement
          ? ({ fontSize: "20px", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration)
          : ({ fontSize: "16px", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration)) as typeof window.getComputedStyle,
    );
    const host = await renderAtWidth(960);
    expect(host.dataset.mediaWidth).toBe("narrow");
  });
});
