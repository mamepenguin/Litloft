import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import { EpubPreview } from "../EpubPreview";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { EPUB_SAVE_DELAY_MS } from "@/lib/epubProgress";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ProfileProvider", () => ({ useProfile: vi.fn() }));

const fullscreenState = { isFullscreen: false, isPseudo: false };
const toggle = vi.fn();
const exit = vi.fn();
vi.mock("@/components/player/hooks/useFullscreen", () => ({
  useFullscreen: () => ({ ...fullscreenState, toggle, exit }),
}));

const mockGetWatchProgress = vi.mocked(getWatchProgress);
const mockSaveWatchProgress = vi.mocked(saveWatchProgress);

const FILE = { id: "BfWVHVupCV23", filename: "b.epub", title: "Book", file_size: 1234 };
const BOOK = new Uint8Array([80, 75, 3, 4]);

let fetchMock: ReturnType<typeof vi.fn>;

function FileNav({ onKey }: { onKey: (key: string) => void }) {
  useShortcuts("file-nav", "Files", [
    { key: "arrowleft", label: "prev", handler: () => onKey("arrowleft") },
    { key: "arrowright", label: "next", handler: () => onKey("arrowright") },
  ]);
  return null;
}

function renderPreview(onFileKey = vi.fn(), initialSection?: number | null) {
  const utils = render(
          <ShortcutsProvider>
        <FileNav onKey={onFileKey} />
        <EpubPreview file={FILE} initialSection={initialSection} />
      </ShortcutsProvider>,
  );
  const iframe = utils.container.querySelector("iframe")!;
  const readerWindow = iframe.contentWindow!;
  const posted = vi.spyOn(readerWindow, "postMessage").mockImplementation(() => {});
  return { ...utils, iframe, readerWindow, posted, onFileKey };
}

async function fromReader(source: Window | null, data: unknown, origin = window.location.origin) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function sentOfType(posted: ReturnType<typeof vi.spyOn>, type: string) {
  return posted.mock.calls.map((c) => c[0] as { type: string }).filter((m) => m.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
  fullscreenState.isFullscreen = false;
  fullscreenState.isPseudo = false;
  vi.mocked(useProfile).mockReturnValue({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
  mockGetWatchProgress.mockResolvedValue({ position: 0.4, duration: 1 });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => BOOK.slice().buffer });
  vi.stubGlobal("fetch", fetchMock);
  document.documentElement.setAttribute("data-theme", "light");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("EpubPreview", () => {
  it("serves the reader document from the reader directory", () => {
    const { iframe } = renderPreview();
    expect(iframe.getAttribute("src")).toBe("/epub-reader/reader.html");
    expect(iframe.hasAttribute("sandbox")).toBe(false);
  });

  it("fetches the book once with credentials", async () => {
    renderPreview();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/files/${FILE.id}/stream`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("opens the book only after the reader boots, at the saved place", async () => {
    const { readerWindow, posted } = renderPreview();
    await settle();
    expect(sentOfType(posted, "open")).toHaveLength(0);

    await fromReader(readerWindow, { type: "boot" });
    await settle();

    const open = sentOfType(posted, "open");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ type: "open", fraction: 0.4, theme: "light" });
    const call = posted.mock.calls.find((c) => (c[0] as { type: string }).type === "open") as unknown[];
    expect(call[1]).toBe(window.location.origin);
    expect(call[2]).toEqual([expect.any(ArrayBuffer)]);
  });

  it("a second boot does not open the book again", async () => {
    const { readerWindow, posted } = renderPreview();
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    expect(sentOfType(posted, "open")).toHaveLength(1);
  });

  it.each([
    [undefined, null],
    [1, 0],
    [3, 2],
    [0, null],
    [1.5, null],
  ])("initialSection %s opens the reader at section index %s", async (initialSection, want) => {
    const { readerWindow, posted } = renderPreview(vi.fn(), initialSection);
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    expect(sentOfType(posted, "open")).toEqual([expect.objectContaining({ section: want })]);
  });

  it.each([undefined, 3])("opening at section %s and becoming ready write nothing; a turn writes", async (initialSection) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { readerWindow } = renderPreview(vi.fn(), initialSection);
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    await fromReader(readerWindow, { type: "ready", dir: "ltr", vertical: false });
    act(() => {
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS * 2);
    });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();

    await fromReader(readerWindow, { type: "turned", fraction: 0.45, atEnd: false });
    act(() => {
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).toHaveBeenCalledWith(FILE.id, 0.45, 1);
  });

  it("ignores a message that does not come from its own reader", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { readerWindow } = renderPreview();
    await fromReader(window, { type: "turned", fraction: 0.9, atEnd: false });
    await fromReader(readerWindow, { type: "turned", fraction: 0.9, atEnd: false }, "https://evil.example");
    act(() => {
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("an arrow handed back by the reader does not move to another file", async () => {
    const { readerWindow, onFileKey } = renderPreview();
    await fromReader(readerWindow, { type: "key", key: "ArrowLeft" });
    await fromReader(readerWindow, { type: "key", key: "ArrowRight" });
    expect(onFileKey).not.toHaveBeenCalled();
  });

  it("a key outside the allowlist is not replayed", async () => {
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener("keydown", listener);
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "key", key: "k" });
    await fromReader(readerWindow, { type: "key", key: "PageDown" });
    document.removeEventListener("keydown", listener);
    expect(seen).toEqual([]);
  });

  it("opens an http(s) link apart from the page, and nothing else", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "link", url: "javascript:alert(1)" });
    await fromReader(readerWindow, { type: "link", url: "/api/drives" });
    expect(open).not.toHaveBeenCalled();
    await fromReader(readerWindow, { type: "link", url: "https://example.com/" });
    expect(open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
  });

  it("entering and leaving full screen keeps the same frame and does not fetch again", async () => {
    const view = renderPreview();
    await fromReader(view.readerWindow, { type: "boot" });
    await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false });
    await settle();

    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    view.rerender(
              <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
    );
    expect(screen.getByTestId("epub-frame").className).toContain("fixed");
    expect(view.container.querySelector("iframe")).toBe(view.iframe);
    expect(sentOfType(view.posted, "mode")).toContainEqual({ type: "mode", fullscreen: true });

    fullscreenState.isFullscreen = false;
    fullscreenState.isPseudo = false;
    view.rerender(
              <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
    );
    expect(view.container.querySelector("iframe")).toBe(view.iframe);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moving to another book loads a new reader and opens the new book", async () => {
    const view = renderPreview();
    await fromReader(view.readerWindow, { type: "boot" });
    await settle();
    await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false });
    expect(screen.queryByRole("status")).toBeNull();

    const next = { ...FILE, id: "Zz9Zz9Zz9Zz9", filename: "c.epub" };
    view.rerender(
      <ShortcutsProvider>
        <FileNav onKey={view.onFileKey} />
        <EpubPreview file={next} />
      </ShortcutsProvider>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    const iframe = view.container.querySelector("iframe")!;
    expect(iframe).not.toBe(view.iframe);
    const readerWindow = iframe.contentWindow!;
    const posted = vi.spyOn(readerWindow, "postMessage").mockImplementation(() => {});
    await fromReader(readerWindow, { type: "boot" });
    await settle();

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `/api/files/${FILE.id}/stream`,
      `/api/files/${next.id}/stream`,
    ]);
    expect(sentOfType(posted, "open")).toHaveLength(1);
  });

  it("the toolbar button opens full screen, and closes it while open", async () => {
    const view = renderPreview();
    const open = screen.getByRole("button", { name: "Read full screen" });
    expect(open).toBeDisabled();
    await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false });
    act(() => open.click());
    expect(toggle).toHaveBeenCalledTimes(1);

    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    view.rerender(
      <ShortcutsProvider>
        <FileNav onKey={view.onFileKey} />
        <EpubPreview file={FILE} />
      </ShortcutsProvider>,
    );
    act(() => screen.getByRole("button", { name: "Exit full screen" }).click());
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("entering full screen hands focus to the reader, and leaving does not", async () => {
    const tree = () => (
      <ShortcutsProvider>
        <EpubPreview file={FILE} />
      </ShortcutsProvider>
    );
    const utils = render(tree());
    const readerWindow = utils.container.querySelector("iframe")!.contentWindow!;
    const focus = vi.spyOn(readerWindow, "focus").mockImplementation(() => {});

    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    utils.rerender(tree());
    expect(focus).toHaveBeenCalledTimes(1);

    fullscreenState.isFullscreen = false;
    fullscreenState.isPseudo = false;
    utils.rerender(tree());
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("in full screen a key the reader does not use reaches nothing beneath it", async () => {
    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    const onFileKey = vi.fn();
    function Beneath() {
      useShortcuts("search", "Search", [{ key: "/", label: "search", handler: () => onFileKey("/") }]);
      return null;
    }
    render(
      <ShortcutsProvider>
        <Beneath />
        <EpubPreview file={FILE} />
      </ShortcutsProvider>,
    );
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    });
    expect(onFileKey).not.toHaveBeenCalled();
  });

  it("inline, the arrows turn pages the way the book reads", async () => {
    const { readerWindow, posted, onFileKey } = renderPreview();
    await fromReader(readerWindow, { type: "ready", dir: "rtl", vertical: true });
    for (const mod of ["shiftKey", "altKey", "ctrlKey"]) {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, [mod]: true }),
        );
      });
    }
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onFileKey).not.toHaveBeenCalled();
    expect(sentOfType(posted, "turn")).toEqual([
      { type: "turn", direction: "left" },
      { type: "turn", direction: "right" },
    ]);
  });

  it("inline, the arrows are left alone while focus is somewhere else, and come back with it", async () => {
    const utils = render(
      <ShortcutsProvider>
        <EpubPreview file={FILE} />
        <button type="button">Elsewhere on the page</button>
      </ShortcutsProvider>,
    );
    const readerWindow = utils.container.querySelector("iframe")!.contentWindow!;
    const posted = vi.spyOn(readerWindow, "postMessage").mockImplementation(() => {});
    await fromReader(readerWindow, { type: "ready", dir: "ltr", vertical: false });
    act(() => {
      screen.getByRole("button", { name: "Elsewhere on the page" }).focus();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(sentOfType(posted, "turn")).toEqual([]);

    // Clicking blank page moves focus to body, which fires focusout alone.
    act(() => {
      screen.getByRole("button", { name: "Elsewhere on the page" }).blur();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(sentOfType(posted, "turn")).toEqual([{ type: "turn", direction: "right" }]);
  });

  it("in full screen the arrows turn pages instead of changing file", async () => {
    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    const { readerWindow, posted, onFileKey } = renderPreview();
    await fromReader(readerWindow, { type: "ready", dir: "rtl", vertical: true });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(onFileKey).not.toHaveBeenCalled();
    expect(sentOfType(posted, "turn")).toEqual([{ type: "turn", direction: "left" }]);
  });

  it("Escape handed back in full screen closes it", async () => {
    fullscreenState.isFullscreen = true;
    fullscreenState.isPseudo = true;
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "key", key: "Escape" });
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("f handed back inline opens full screen once the book is ready", async () => {
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "key", key: "f" });
    expect(toggle).not.toHaveBeenCalled();
    await fromReader(readerWindow, { type: "ready", dir: "ltr", vertical: false });
    await fromReader(readerWindow, { type: "key", key: "f" });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("follows the page's theme", async () => {
    const { readerWindow, posted } = renderPreview();
    await fromReader(readerWindow, { type: "ready", dir: "ltr", vertical: false });
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      await Promise.resolve();
    });
    expect(sentOfType(posted, "theme")).toContainEqual({ type: "theme", theme: "dark" });
  });

  it("leaves the shared reading-direction preference alone", async () => {
    window.localStorage.setItem("image-viewer:reading-direction", "ltr");
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    await fromReader(readerWindow, { type: "ready", dir: "rtl", vertical: true });
    expect(window.localStorage.getItem("image-viewer:reading-direction")).toBe("ltr");
  });

  it.each([
    ["unsupported", "Fixed-layout books cannot be shown yet"],
    ["parse", "This book could not be opened"],
    ["isolation", "This book could not be opened"],
  ])("a reader error of %s offers the download", async (code, text) => {
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "error", code });
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/api/files/${FILE.id}/download`,
    );
  });

  it("a book that cannot be fetched offers the download", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    const { readerWindow } = renderPreview();
    await fromReader(readerWindow, { type: "boot" });
    await settle();
    expect(screen.getByText(/This book could not be opened/)).toBeInTheDocument();
  });

  describe("the position bar", () => {
    const TOC = [
      { label: "Cover", depth: 0, fraction: 0 },
      { label: "<b>One</b>", depth: 0, fraction: 0.2 },
      { label: "Two", depth: 0, fraction: 0.6 },
    ];

    async function openBook(dir: "ltr" | "rtl" = "ltr") {
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      await fromReader(view.readerWindow, { type: "ready", dir, vertical: false, toc: TOC });
      return view;
    }

    const slider = () => screen.getByRole("slider");
    const line = () => screen.getByTestId("epub-position-line");

    it("is disabled until the reader says where it is", async () => {
      const view = await openBook();
      expect(slider()).toBeDisabled();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.25, tocIndex: 1, pagesLeft: 4 });
      expect(slider()).toBeEnabled();
      expect(slider()).toHaveValue("250");
      expect(line()).toHaveTextContent("25%");
      expect(line()).toHaveTextContent("left in chapter");
      await fromReader(view.readerWindow, { type: "location", fraction: 0.25, tocIndex: 1, pagesLeft: null });
      expect(line()).not.toHaveTextContent("left in chapter");
    });

    it("ignores a place reported before the book is ready", async () => {
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.5, tocIndex: 2, pagesLeft: 1 });
      await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false, toc: TOC });
      expect(slider()).toBeDisabled();
    });

    it("shows a chapter title from the book as text", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.25, tocIndex: 1, pagesLeft: 4 });
      expect(line()).toHaveTextContent("<b>One</b>");
      expect(line().querySelector("b")).toBeNull();
    });

    it("a drag moves only the label, and the release seeks once and hands the keys back to the book", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      const focus = vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});

      const row = pressRow(100);
      fireEvent.pointerMove(row, { clientX: 700, pointerId: 1, buttons: 1 });
      expect(line()).toHaveTextContent("70%");
      expect(line()).toHaveTextContent("Two");
      expect(sentOfType(view.posted, "seek")).toEqual([]);

      fireEvent.pointerUp(row, { clientX: 700, pointerId: 1 });
      expect(sentOfType(view.posted, "seek")).toEqual([{ type: "seek", fraction: 0.7, id: expect.any(Number) }]);
      expect(focus).toHaveBeenCalled();
    });

    const lastSeek = (posted: ReturnType<typeof vi.spyOn>) =>
      sentOfType(posted, "seek").at(-1) as unknown as { fraction: number; id: number };

    /** Presses the row where the value would be `value` out of 1000. */
    function pressRow(value: number) {
      stubPointerEvent();
      const row = rowAt(0, 1000);
      fireEvent.pointerDown(row, { clientX: value, pointerId: 1, buttons: 1 });
      return row;
    }

    async function released(view: Awaited<ReturnType<typeof openBook>>, value: string) {
      const row = pressRow(Number(value));
      fireEvent.pointerUp(row, { clientX: Number(value), pointerId: 1 });
      return lastSeek(view.posted);
    }

    it("after the release the thumb stays where it was let go until the reader answers that seek", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      const seek = await released(view, "700");
      expect(slider()).toHaveValue("700");
      await fromReader(view.readerWindow, { type: "location", fraction: 0.4, tocIndex: 1, pagesLeft: 9 });
      expect(slider()).toHaveValue("700");
      expect(line()).toHaveTextContent("Two");
      expect(line()).not.toHaveTextContent("left in chapter");

      await fromReader(view.readerWindow, { type: "location", fraction: 0.68, tocIndex: 2, pagesLeft: 3 });
      await fromReader(view.readerWindow, { type: "seeked", id: seek.id });
      expect(slider()).toHaveValue("680");
      expect(line()).toHaveTextContent("68%");
      expect(line()).toHaveTextContent("left in chapter");
    });

    it("a seek that lands on the page already shown lets the thumb go back to it", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      fireEvent.change(slider(), { target: { value: "101" } });
      expect(slider()).toHaveValue("101");
      await fromReader(view.readerWindow, { type: "seeked", id: lastSeek(view.posted).id });
      expect(slider()).toHaveValue("100");
      expect(line()).toHaveTextContent("left in chapter");
    });

    it("the answer to an earlier seek does not release a later one", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      const first = await released(view, "300");
      const second = await released(view, "800");
      expect(second.id).not.toBe(first.id);
      await fromReader(view.readerWindow, { type: "location", fraction: 0.3, tocIndex: 1, pagesLeft: 2 });
      await fromReader(view.readerWindow, { type: "seeked", id: first.id });
      expect(slider()).toHaveValue("800");
    });

    it.each([
      ["mid-seek", true],
      ["mid-drag", false],
    ])("another book opened %s starts with no place", async (_when, release) => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      if (release) await released(view, "700");
      else pressRow(700);
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={{ ...FILE, id: "Other1234567" }} />
        </ShortcutsProvider>,
      );
      expect(slider()).toBeDisabled();
      expect(slider()).toHaveValue("0");
      expect(line()).toHaveTextContent(/^0%/);
    });

    // jsdom has no PointerEvent, and without one fireEvent drops clientX.
    function stubPointerEvent() {
      vi.stubGlobal(
        "PointerEvent",
        class extends MouseEvent {
          pointerId: number;
          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 0;
          }
        },
      );
    }

    function rowAt(left: number, width: number) {
      const row = slider().parentElement!;
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
        left, right: left + width, width, top: 0, bottom: 24, height: 24, x: left, y: 0, toJSON: () => ({}),
      } as DOMRect);
      return row;
    }

    it.each([
      ["ltr", 95, "750", 0.2],
      ["rtl", 95, "250", 0.8],
    ] as const)("in a %s book a finger anywhere on the row drags from where it lands", async (dir, x, value, released) => {
      stubPointerEvent();
      const view = await openBook(dir);
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      const row = rowAt(20, 100);
      fireEvent.pointerDown(row, { clientX: x, pointerId: 1, buttons: 1 });
      expect(slider()).toHaveValue(value);
      fireEvent.pointerMove(row, { clientX: 40, pointerId: 1, buttons: 1 });
      fireEvent.pointerUp(row, { clientX: 40, pointerId: 1 });
      expect(sentOfType(view.posted, "seek")).toHaveLength(1);
      expect(lastSeek(view.posted).fraction).toBe(released);
    });

    it("a pointer drag on a slider the keyboard left focused follows the pointer and seeks once", async () => {
      stubPointerEvent();
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      slider().focus();
      const row = rowAt(0, 100);
      fireEvent.pointerDown(row, { clientX: 80, pointerId: 1, buttons: 1 });
      fireEvent.pointerMove(row, { clientX: 20, pointerId: 1, buttons: 1 });
      fireEvent.pointerUp(row, { clientX: 20, pointerId: 1 });
      expect(sentOfType(view.posted, "seek").map((m) => (m as unknown as { fraction: number }).fraction)).toEqual([0.2]);
    });

    it("a press on the row leaves focus where it is, so release can hand the keys to the book", async () => {
      stubPointerEvent();
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      expect(fireEvent.pointerDown(rowAt(0, 100), { clientX: 50, pointerId: 1, buttons: 1, cancelable: true })).toBe(false);
    });

    it("the knob and the filled part of the track follow the reading direction", async () => {
      const view = await openBook("rtl");
      await fromReader(view.readerWindow, { type: "location", fraction: 0.25, tocIndex: 1, pagesLeft: 2 });
      const fill = screen.getByTestId("epub-position-fill");
      expect(fill.style.right).toBe("0px");
      expect(fill.style.width).toBe("25%");
      expect(screen.getByTestId("epub-position-knob").style.left).toContain("75%");
    });

    it("while the book is opening the bar sends nothing and shows no knob", async () => {
      stubPointerEvent();
      const view = await openBook();
      expect(slider()).toBeDisabled();
      expect(screen.queryByTestId("epub-position-knob")).toBeNull();
      const row = rowAt(0, 100);
      fireEvent.pointerDown(row, { clientX: 70, pointerId: 1, buttons: 1 });
      fireEvent.pointerMove(row, { clientX: 60, pointerId: 1, buttons: 1 });
      fireEvent.pointerUp(row, { clientX: 60, pointerId: 1 });
      expect(sentOfType(view.posted, "seek")).toEqual([]);
      expect(slider()).toHaveValue("0");
    });

    it("a change from the keyboard or a screen reader seeks at once and keeps focus on the slider", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      const focus = vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      fireEvent.change(slider(), { target: { value: "300" } });
      expect(sentOfType(view.posted, "seek")).toEqual([{ type: "seek", fraction: 0.3, id: expect.any(Number) }]);
      expect(slider()).toHaveValue("300");
      expect(focus).not.toHaveBeenCalled();
    });

    it.each([
      ["ltr", "ArrowRight", "right"],
      ["ltr", "ArrowLeft", "left"],
      ["rtl", "ArrowRight", "right"],
      ["rtl", "ArrowLeft", "left"],
      ["ltr", "ArrowUp", "next"],
      ["rtl", "ArrowDown", "prev"],
    ] as const)("in a %s book, %s on the slider turns the page %s instead of stepping it", async (dir, key, direction) => {
      const view = await openBook(dir);
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      expect(fireEvent.keyDown(slider(), { key, cancelable: true })).toBe(false);
      expect(fireEvent.keyDown(slider(), { key, repeat: true, cancelable: true })).toBe(false);
      expect(sentOfType(view.posted, "turn")).toEqual([
        { type: "turn", direction },
        { type: "turn", direction },
      ]);
      expect(sentOfType(view.posted, "seek")).toEqual([]);
    });

    it("in full screen too, an arrow on the slider turns the page", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      rerenderFullscreen(view, true);
      fireEvent.keyDown(slider(), { key: "ArrowRight", cancelable: true });
      expect(sentOfType(view.posted, "turn")).toEqual([{ type: "turn", direction: "right" }]);
    });

    it.each(["Home", "End", "PageUp", "PageDown"])("%s on the slider is left to the range, which seeks", async (key) => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      expect(fireEvent.keyDown(slider(), { key, cancelable: true })).toBe(true);
      expect(sentOfType(view.posted, "turn")).toEqual([]);
    });

    it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"])("an arrow with %s is left to the browser", async (modifier) => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      expect(fireEvent.keyDown(slider(), { key: "ArrowRight", [modifier]: true, cancelable: true })).toBe(true);
      expect(sentOfType(view.posted, "turn")).toEqual([]);
    });

    it("in full screen, a change from the keyboard leaves nothing holding the bar up", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      rerenderFullscreen(view, true);
      fireEvent.change(slider(), { target: { value: "300" } });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId("epub-chrome-bottom")).toHaveAttribute("inert");
    });

    it("runs right to left for a right-to-left book", async () => {
      await openBook("rtl");
      expect(slider()).toHaveAttribute("dir", "rtl");
    });

    it("a new place from the reader does not write progress", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.8, tocIndex: 2, pagesLeft: 0 });
      act(() => {
        vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS * 2);
      });
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });

    it("in full screen, a tap in the book toggles the bar and other activity brings it back", async () => {
      const view = await openBook();
      fullscreenState.isFullscreen = true;
      fullscreenState.isPseudo = true;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      const bottom = () => screen.getByTestId("epub-chrome-bottom");
      expect(bottom()).not.toHaveAttribute("inert");
      await fromReader(view.readerWindow, { type: "activity", kind: "tap" });
      expect(bottom()).toHaveAttribute("inert");
      await fromReader(view.readerWindow, { type: "activity", kind: "pointer" });
      expect(bottom()).not.toHaveAttribute("inert");
      await fromReader(view.readerWindow, { type: "activity", kind: "tap" });
      await fromReader(view.readerWindow, { type: "activity", kind: "key" });
      expect(bottom()).not.toHaveAttribute("inert");
    });

    function rerenderFullscreen(view: Awaited<ReturnType<typeof openBook>>, on: boolean) {
      fullscreenState.isFullscreen = on;
      fullscreenState.isPseudo = on;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
    }

    it("in full screen, the bar stays up while the slider is dragged and hides once it is released", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      rerenderFullscreen(view, true);
      const bottom = () => screen.getByTestId("epub-chrome-bottom");

      stubPointerEvent();
      const row = rowAt(0, 100);
      fireEvent.pointerDown(row, { clientX: 50, pointerId: 1, buttons: 1 });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(bottom()).not.toHaveAttribute("inert");

      fireEvent.pointerUp(row, { clientX: 50, pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(bottom()).toHaveAttribute("inert");
    });

    it("a drag cut short by leaving full screen does not keep the bar up the next time", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      rerenderFullscreen(view, true);
      stubPointerEvent();
      fireEvent.pointerDown(rowAt(0, 100), { clientX: 50, pointerId: 1, buttons: 1 });
      rerenderFullscreen(view, false);
      rerenderFullscreen(view, true);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId("epub-chrome-bottom")).toHaveAttribute("inert");
    });

    it("another book starts with no place and no chapter from the last one", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "location", fraction: 0.25, tocIndex: 1, pagesLeft: 4 });
      expect(slider()).toBeEnabled();
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={{ ...FILE, id: "Other1234567" }} />
        </ShortcutsProvider>,
      );
      expect(slider()).toBeDisabled();
      expect(line()).not.toHaveTextContent("One");
      expect(line()).toHaveTextContent("0%");
    });

    it("inline, the bar never hides", async () => {
      const view = await openBook();
      await fromReader(view.readerWindow, { type: "activity", kind: "tap" });
      expect(slider().closest("[inert]")).toBeNull();
      expect(screen.queryByTestId("epub-chrome-bottom")).toBeNull();
    });
  });

  describe("text settings", () => {
    const TOC = [{ label: "One", depth: 0, fraction: 0 }];

    async function openReady() {
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false, toc: TOC });
      await fromReader(view.readerWindow, { type: "location", fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      const focus = vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      return { ...view, focus };
    }

    const aa = () => screen.getByRole("button", { name: "Text settings" });
    const panel = () => screen.queryByTestId("epub-typography-panel");

    beforeEach(() => localStorage.clear());

    it("opens the book with the setting stored on this device", async () => {
      localStorage.setItem("epub-reader:typography", JSON.stringify({ fontSize: 5, margin: "wide" }));
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      expect(sentOfType(view.posted, "open")[0]).toMatchObject({
        typography: { fontSize: 5, lineHeight: "original", margin: "wide", fontFamily: "original" },
      });
    });

    it("cannot be opened before the book reports its place", async () => {
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      expect(aa()).toBeDisabled();
    });

    it("opens with focus in the panel, and a change is sent and stored at once", async () => {
      const view = await openReady();
      fireEvent.click(aa());
      expect(aa()).toHaveAttribute("aria-expanded", "true");
      expect(panel()).toHaveFocus();
      fireEvent.click(screen.getByRole("button", { name: "Larger text" }));
      fireEvent.click(within(screen.getByRole("group", { name: "Font" })).getByRole("button", { name: "Serif" }));
      const sent = sentOfType(view.posted, "typography") as unknown as { typography: unknown }[];
      expect(sent.at(-1)!.typography).toEqual({ fontSize: 3, lineHeight: "original", margin: "normal", fontFamily: "serif" });
      expect(JSON.parse(localStorage.getItem("epub-reader:typography")!)).toEqual(sent.at(-1)!.typography);
      expect(sentOfType(view.posted, "turn")).toEqual([]);
    });

    it.each([
      ["Aa again", () => fireEvent.click(aa())],
      ["a press on the book", () => fireEvent.pointerDown(screen.getByTestId("epub-panel-cover"))],
      ["a click on the book's cover from the keyboard", () => fireEvent.click(screen.getByTestId("epub-panel-cover"))],
      ["a press and click on Aa", () => {
        fireEvent.pointerDown(aa());
        fireEvent.click(aa());
      }],
      ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ])("closes on %s, turns nothing, and hands the keys back to the book", async (_how, close) => {
      const view = await openReady();
      fireEvent.click(aa());
      close();
      expect(panel()).toBeNull();
      expect(screen.queryByTestId("epub-panel-cover")).toBeNull();
      expect(view.focus).toHaveBeenCalled();
      expect(sentOfType(view.posted, "turn")).toEqual([]);
    });

    it("closes when full screen is entered or left", async () => {
      const view = await openReady();
      fireEvent.click(aa());
      fullscreenState.isFullscreen = true;
      fullscreenState.isPseudo = true;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      expect(panel()).toBeNull();
      fireEvent.click(aa());
      expect(panel()).not.toBeNull();
      fullscreenState.isFullscreen = false;
      fullscreenState.isPseudo = false;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      expect(panel()).toBeNull();
    });

    it("in pseudo full screen, Escape closes the panel and not full screen, and the bar stays up while it is open", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openReady();
      fullscreenState.isFullscreen = true;
      fullscreenState.isPseudo = true;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      fireEvent.click(aa());
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId("epub-chrome-bottom")).not.toHaveAttribute("inert");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(panel()).toBeNull();
      expect(exit).not.toHaveBeenCalled();
    });

    it("draws the panel where a swipe does not change full screen", async () => {
      await openReady();
      fireEvent.click(aa());
      expect(panel()!.closest("[data-swipe-exempt]")).not.toBeNull();
    });

    it("is the only thing a press does not close it on: everything else over the book is the cover", async () => {
      await openReady();
      fireEvent.click(aa());
      // DismissScrim spares only the element right after the cover.
      expect(screen.getByTestId("epub-panel-cover").nextElementSibling).toBe(panel());
    });

    it("hands the keys back to the book when leaving full screen closes it", async () => {
      const view = await openReady();
      fullscreenState.isFullscreen = true;
      fullscreenState.isPseudo = true;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      fireEvent.click(aa());
      view.focus.mockClear();
      fullscreenState.isFullscreen = false;
      fullscreenState.isPseudo = false;
      view.rerender(
        <ShortcutsProvider>
          <FileNav onKey={view.onFileKey} />
          <EpubPreview file={FILE} />
        </ShortcutsProvider>,
      );
      expect(panel()).toBeNull();
      expect(view.focus).toHaveBeenCalled();
    });

    it("stops at the smallest and the largest size", async () => {
      localStorage.setItem("epub-reader:typography", JSON.stringify({ fontSize: 0 }));
      const small = await openReady();
      fireEvent.click(aa());
      expect(screen.getByRole("button", { name: "Smaller text" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Larger text" })).toBeEnabled();
      small.unmount();
      localStorage.setItem("epub-reader:typography", JSON.stringify({ fontSize: 6 }));
      await openReady();
      fireEvent.click(aa());
      expect(screen.getByRole("button", { name: "Larger text" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Smaller text" })).toBeEnabled();
    });
  });

  describe("table of contents", () => {
    const TOC = [
      { label: "Cover", depth: 0, fraction: 0 },
      { label: "Part <b>one</b>", depth: 0, fraction: null },
      { label: "One", depth: 1, fraction: 0.2 },
      { label: "", depth: 1, fraction: 0.5 },
      { label: "Gone", depth: 0, fraction: null },
      { label: "Three", depth: 0, fraction: 0.7 },
    ];

    async function openWith(toc: unknown[], place = { fraction: 0.55, tocIndex: 3 as number | null, pagesLeft: 2 }) {
      const view = renderPreview();
      await fromReader(view.readerWindow, { type: "boot" });
      await settle();
      await fromReader(view.readerWindow, { type: "ready", dir: "ltr", vertical: false, toc });
      await fromReader(view.readerWindow, { type: "location", ...place });
      const focus = vi.spyOn(view.readerWindow, "focus").mockImplementation(() => {});
      return { ...view, focus };
    }

    const contents = () => screen.getByRole("button", { name: "Contents" });
    const aa = () => screen.getByRole("button", { name: "Text settings" });
    const panel = () => screen.queryByTestId("epub-toc-panel");
    const entry = (i: number) => panel()!.querySelector<HTMLButtonElement>(`[data-toc-index="${i}"]`)!;

    beforeEach(() => localStorage.clear());

    it.each([
      ["an empty table of contents", []],
      ["one whose entries have no target", [{ label: "Part", depth: 0, fraction: null }]],
    ])("is disabled for %s", async (_name, toc) => {
      await openWith(toc, { fraction: 0.1, tocIndex: null, pagesLeft: 2 });
      expect(contents()).toBeDisabled();
    });

    it("lists the entries as text, indented, with the untitled and target-less ones marked", async () => {
      await openWith(TOC);
      fireEvent.click(contents());
      expect(entry(1)).toHaveTextContent("Part <b>one</b>");
      expect(panel()!.querySelector("b")).toBeNull();
      expect(entry(3)).toHaveTextContent("Untitled");
      expect(entry(1)).toBeDisabled();
      expect(entry(4)).toBeDisabled();
      expect(parseFloat(entry(2).style.paddingLeft)).toBeGreaterThan(parseFloat(entry(0).style.paddingLeft));
    });

    it.each([
      ["the reported entry", { fraction: 0.55, tocIndex: 3, pagesLeft: 2 }, 3, 3],
      ["the entry for the place when none is reported", { fraction: 0.75, tocIndex: null, pagesLeft: 2 }, 5, 5],
      ["the first entry that can be pressed when the current one cannot", { fraction: 0.1, tocIndex: 1, pagesLeft: 2 }, 1, 0],
    ])("marks %s and puts focus where it can", async (_name, place, marked, focused) => {
      await openWith(TOC, place);
      fireEvent.click(contents());
      expect(panel()!.querySelectorAll("[aria-current]")).toHaveLength(1);
      expect(entry(marked)).toHaveAttribute("aria-current", "true");
      expect(entry(focused)).toHaveFocus();
    });

    it("puts focus on the first entry that can be pressed when the first one cannot", async () => {
      await openWith([{ label: "Part", depth: 0, fraction: null }, ...TOC.slice(2)], { fraction: 0.1, tocIndex: 0, pagesLeft: 2 });
      fireEvent.click(contents());
      expect(entry(0)).toHaveAttribute("aria-current", "true");
      expect(entry(1)).toHaveFocus();
    });

    it.each([
      ["ArrowDown on the last entry", "End", "ArrowDown", 5],
      ["ArrowUp on the first entry", "Home", "ArrowUp", 0],
    ])("%s stays there, without an error", async (_name, first, key, stays) => {
      await openWith(TOC);
      fireEvent.click(contents());
      const errors: unknown[] = [];
      const onError = (e: ErrorEvent) => errors.push(e.error);
      window.addEventListener("error", onError);
      try {
        fireEvent.keyDown(document.activeElement!, { key: first });
        fireEvent.keyDown(document.activeElement!, { key });
      } finally {
        window.removeEventListener("error", onError);
      }
      expect(entry(stays)).toHaveFocus();
      expect(errors).toEqual([]);
    });

    it("selecting an entry sends only its index, closes the panel and hands the keys back", async () => {
      const view = await openWith(TOC);
      fireEvent.click(contents());
      fireEvent.click(entry(5));
      expect(sentOfType(view.posted, "goToToc")).toEqual([{ type: "goToToc", index: 5 }]);
      expect(panel()).toBeNull();
      expect(view.focus).toHaveBeenCalled();
    });

    it.each([
      ["ArrowDown", 3, 5],
      ["ArrowUp", 3, 2],
      ["Home", 3, 0],
      ["End", 3, 5],
    ])("%s moves between entries that can be pressed, and the page does not scroll", async (key, _from, to) => {
      await openWith(TOC);
      fireEvent.click(contents());
      expect(fireEvent.keyDown(document.activeElement!, { key, cancelable: true })).toBe(false);
      expect(entry(to)).toHaveFocus();
    });

    it("stays open once opened, and one panel replaces the other from the keyboard", async () => {
      await openWith(TOC);
      fireEvent.click(contents());
      expect(panel()).not.toBeNull();
      fireEvent.click(aa());
      expect(panel()).toBeNull();
      expect(screen.getByTestId("epub-typography-panel")).not.toBeNull();
      expect(screen.getByTestId("epub-panel-cover").nextElementSibling).toBe(screen.getByTestId("epub-typography-panel"));
      fireEvent.click(contents());
      expect(screen.queryByTestId("epub-typography-panel")).toBeNull();
      expect(screen.getByTestId("epub-panel-cover").nextElementSibling).toBe(panel());
    });

    it.each([
      ["a press on the book", () => fireEvent.pointerDown(screen.getByTestId("epub-panel-cover"))],
      ["its button", () => fireEvent.click(contents())],
      ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ])("closes on %s, turns nothing and hands the keys back", async (_how, close) => {
      const view = await openWith(TOC);
      fireEvent.click(contents());
      close();
      expect(panel()).toBeNull();
      expect(view.focus).toHaveBeenCalled();
      expect(sentOfType(view.posted, "turn")).toEqual([]);
      expect(sentOfType(view.posted, "goToToc")).toEqual([]);
    });

    it("closes and hands the keys back when full screen changes, holds the chrome, and sits where a swipe is ignored", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const view = await openWith(TOC);
      const rerender = (on: boolean) => {
        fullscreenState.isFullscreen = on;
        fullscreenState.isPseudo = on;
        view.rerender(
          <ShortcutsProvider>
            <FileNav onKey={view.onFileKey} />
            <EpubPreview file={FILE} />
          </ShortcutsProvider>,
        );
      };
      rerender(true);
      fireEvent.click(contents());
      expect(panel()!.closest("[data-swipe-exempt]")).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId("epub-chrome-bottom")).not.toHaveAttribute("inert");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(panel()).toBeNull();
      expect(exit).not.toHaveBeenCalled();
      fireEvent.click(contents());
      view.focus.mockClear();
      rerender(false);
      expect(panel()).toBeNull();
      expect(view.focus).toHaveBeenCalled();
    });
  });
});
