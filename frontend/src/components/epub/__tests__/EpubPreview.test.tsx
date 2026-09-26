import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

function renderPreview(onFileKey = vi.fn()) {
  const utils = render(
          <ShortcutsProvider>
        <FileNav onKey={onFileKey} />
        <EpubPreview file={FILE} />
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

  it("opening and becoming ready write nothing; a turn writes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { readerWindow } = renderPreview();
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
});
