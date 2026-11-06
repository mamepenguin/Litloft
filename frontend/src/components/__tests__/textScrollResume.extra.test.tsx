import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TextPreview } from "../TextPreview";
import { MarkdownFileViewer } from "../MarkdownFileViewer";
import { MarkdownPreview } from "../MarkdownPreview";
import { useProfile } from "../ProfileProvider";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { getSavedPlayback, addRecentlyPlayed } from "@/lib/recentlyPlayed";
import { TextScrollFileIdContext } from "@/lib/textScrollProgress";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWikiResolutions: async () => ({}),
}));
vi.mock("../ProfileProvider", () => ({ useProfile: vi.fn() }));

const BODY = "line of text\n".repeat(60);

function profile(nickname: string | null) {
  vi.mocked(useProfile).mockReturnValue({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

interface Host {
  el: HTMLElement;
  setHeights: (scrollHeight: number, clientHeight: number) => void;
  readerScrollTo: (top: number) => void;
}

// jsdom lays nothing out, so the host reports the sizes a browser would
// report in each state. Programmatic scrolls clamp and raise their event
// afterwards, as a browser does.
function makeHost(scrollHeight: number, clientHeight: number): Host {
  const el = document.createElement("div");
  el.style.overflowY = "auto";
  document.body.appendChild(el);
  let height = scrollHeight;
  let visible = clientHeight;
  let top = 0;
  const max = () => Math.max(0, height - visible);
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => visible,
  });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, max()));
      queueMicrotask(() => el.dispatchEvent(new Event("scroll")));
    },
  });
  el.scrollTo = ((options: ScrollToOptions | number, y?: number) => {
    el.scrollTop =
      typeof options === "number" ? (y ?? 0) : (options.top ?? el.scrollTop);
  }) as typeof el.scrollTo;
  return {
    el,
    setHeights: (nextHeight, nextVisible) => {
      height = nextHeight;
      visible = nextVisible;
      top = Math.max(0, Math.min(top, max()));
    },
    readerScrollTo: (value) => {
      top = Math.max(0, Math.min(value, max()));
      el.dispatchEvent(new Event("scroll"));
    },
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(BODY, { status: 200 })),
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

async function debounceElapses() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

beforeEach(() => {
  vi.mocked(getWatchProgress).mockReset().mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockReset().mockResolvedValue(undefined);
  profile("kaori");
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  window.location.hash = "";
});

describe("SPEC-CORE-050 the Markdown editor's edit mode", () => {
  it("writes nothing while the preview is hidden and records once the read view is shown", async () => {
    stubFetch();
    // The addon editor keeps the preview mounted while editing, inside a
    // wrapper that is `hidden`; a browser reports no boxes for it.
    const host = makeHost(0, 0);
    host.el.style.display = "none";
    render(
      <TextScrollFileIdContext.Provider value="textfile0001">
        <MarkdownPreview source={BODY} chrome={false} />
      </TextScrollFileIdContext.Provider>,
      { container: host.el },
    );
    await waitFor(() => expect(host.el.textContent).toContain("line of text"));
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(500);
    await debounceElapses();
    expect(saveWatchProgress).not.toHaveBeenCalled();

    // Switching back to the read view gives the preview a real box.
    host.el.style.display = "";
    host.setHeights(3000, 1000);
    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalledWith("textfile0001", 500, 1000);
  });
});

describe("SPEC-CORE-050 recording follows the current document height", () => {
  it("turns on at two screens and off again when the document shrinks", async () => {
    stubFetch();
    const host = makeHost(1999, 1000);
    render(<TextPreview fileId="textfile0001" fileSize={BODY.length} />, {
      container: host.el,
    });
    await waitFor(() => expect(host.el.textContent).toContain("line of text"));
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(500);
    await debounceElapses();
    expect(saveWatchProgress).not.toHaveBeenCalled();

    host.setHeights(2000, 1000);
    host.readerScrollTo(500);
    await debounceElapses();
    expect(saveWatchProgress).toHaveBeenCalledWith("textfile0001", 500, 1000);

    vi.mocked(saveWatchProgress).mockClear();
    host.setHeights(1500, 1000);
    host.readerScrollTo(300);
    await debounceElapses();
    expect(saveWatchProgress).not.toHaveBeenCalled();
  });
});

describe.each(["text", "markdown"] as const)(
  "SPEC-CORE-050 a pending stored read (%s)",
  (doc) => {
    it("leaves the text at the top until the read returns, then restores", async () => {
      let resolve!: (value: { position: number; duration: number }) => void;
      vi.mocked(getWatchProgress).mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      stubFetch();
      const host = makeHost(3000, 1000);
      render(
        doc === "text" ? (
          <TextPreview fileId="textfile0001" fileSize={BODY.length} />
        ) : (
          <MarkdownFileViewer fileId="textfile0001" />
        ),
        { container: host.el },
      );
      await waitFor(() => expect(host.el.textContent).toContain("line of text"));
      await settle();

      expect(host.el.scrollTop).toBe(0);
      expect(saveWatchProgress).not.toHaveBeenCalled();

      await act(async () => {
        resolve({ position: 500, duration: 1000 });
      });
      await waitFor(() => expect(host.el.scrollTop).toBe(1000));
    });
  },
);

describe.each(["text", "markdown"] as const)(
  "SPEC-CORE-050 the next file's text is still being fetched (%s)",
  (doc) => {
    it("records nothing for the old text and restores only the new file's position", async () => {
      const FIRST = "textfile0001";
      const SECOND = "textfile0002";
      let resolveSecondText!: (value: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes(SECOND)) {
            return new Promise<Response>((r) => {
              resolveSecondText = r;
            });
          }
          return Promise.resolve(new Response(BODY, { status: 200 }));
        }),
      );
      vi.mocked(getWatchProgress).mockImplementation(async (fileId) => {
        if (fileId === FIRST) return { position: 500, duration: 1000 };
        return { position: 100, duration: 1000 };
      });

      const host = makeHost(3000, 1000);
      const view = render(
        doc === "text" ? (
          <TextPreview fileId={FIRST} fileSize={BODY.length} />
        ) : (
          <MarkdownFileViewer fileId={FIRST} />
        ),
        { container: host.el },
      );
      await waitFor(() => expect(host.el.scrollTop).toBe(1000));

      view.rerender(
        doc === "text" ? (
          <TextPreview fileId={SECOND} fileSize={BODY.length} />
        ) : (
          <MarkdownFileViewer fileId={SECOND} />
        ),
      );
      await settle();
      vi.useFakeTimers();

      // The old text is still on screen while the new one is in flight, but it
      // no longer belongs to the file the page is showing.
      host.readerScrollTo(300);
      await debounceElapses();
      expect(saveWatchProgress).not.toHaveBeenCalled();
      expect(host.el.scrollTop).toBe(300);

      await act(async () => {
        resolveSecondText(new Response(BODY, { status: 200 }));
      });
      expect(host.el.scrollTop).toBe(200);

      host.readerScrollTo(1000);
      await debounceElapses();
      expect(saveWatchProgress).toHaveBeenCalledWith(SECOND, 500, 1000);
    });
  },
);

describe("SPEC-CORE-050 the profile decides the store at each save", () => {
  it("writes to the server when a nickname is set before the save", async () => {
    stubFetch();
    profile(null);
    const host = makeHost(3000, 1000);
    const view = render(
      <TextPreview fileId="textfile0001" fileSize={BODY.length} />,
      { container: host.el },
    );
    await waitFor(() => expect(host.el.textContent).toContain("line of text"));
    await settle();
    vi.useFakeTimers();

    profile("kaori");
    view.rerender(<TextPreview fileId="textfile0001" fileSize={BODY.length} />);
    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalledWith("textfile0001", 500, 1000);
    expect(getSavedPlayback("textfile0001")).toEqual({ position: 0, duration: 0 });
  });

  it("writes locally when the nickname is cleared before the save", async () => {
    stubFetch();
    profile(null);
    addRecentlyPlayed("textfile0001");
    const host = makeHost(3000, 1000);
    const view = render(
      <TextPreview fileId="textfile0001" fileSize={BODY.length} />,
      { container: host.el },
    );
    await waitFor(() => expect(host.el.textContent).toContain("line of text"));
    await settle();
    vi.useFakeTimers();

    profile(null);
    view.rerender(<TextPreview fileId="textfile0001" fileSize={BODY.length} />);
    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(getSavedPlayback("textfile0001")).toEqual({ position: 500, duration: 1000 });
  });
});
