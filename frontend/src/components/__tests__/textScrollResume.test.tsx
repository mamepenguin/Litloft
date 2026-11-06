import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TextPreview } from "../TextPreview";
import { MarkdownFileViewer } from "../MarkdownFileViewer";
import { useProfile } from "../ProfileProvider";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import {
  addRecentlyPlayed,
  getSavedPlayback,
  saveProgress,
} from "@/lib/recentlyPlayed";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWikiResolutions: async () => ({}),
}));
vi.mock("../ProfileProvider", () => ({ useProfile: vi.fn() }));

const FILE = "textfile0001";
const BODY = "line of text\n".repeat(60);

type Doc = "text" | "markdown";
const DOCS: Doc[] = ["text", "markdown"];

function profile(nickname: string | null) {
  vi.mocked(useProfile).mockReturnValue({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function stored(position: number, duration = 1000) {
  vi.mocked(getWatchProgress).mockResolvedValue({ position, duration });
}

interface Host {
  el: HTMLElement;
  readerScrollTo: (top: number) => void;
}

// The host is stubbed because jsdom lays nothing out. Programmatic scrolls
// clamp and raise their scroll event afterwards, as a browser does.
function makeHost(scrollHeight: number, clientHeight: number): Host {
  const el = document.createElement("div");
  el.style.overflowY = "auto";
  document.body.appendChild(el);
  let top = 0;
  const max = Math.max(0, scrollHeight - clientHeight);
  const set = (v: number) => {
    top = Math.max(0, Math.min(v, max));
  };
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      set(v);
      queueMicrotask(() => el.dispatchEvent(new Event("scroll")));
    },
  });
  el.scrollTo = ((a: ScrollToOptions | number, b?: number) => {
    set(typeof a === "number" ? (b ?? 0) : (a.top ?? top));
    queueMicrotask(() => el.dispatchEvent(new Event("scroll")));
  }) as typeof el.scrollTo;
  return {
    el,
    readerScrollTo: (v) => {
      set(v);
      el.dispatchEvent(new Event("scroll"));
    },
  };
}

async function open(doc: Doc, host: Host, extra: { highlight?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(BODY, { status: 200 })),
  );
  const ui =
    doc === "text" ? (
      <TextPreview fileId={FILE} fileSize={BODY.length} {...extra} />
    ) : (
      <MarkdownFileViewer fileId={FILE} {...extra} />
    );
  const view = render(ui, { container: host.el });
  await waitFor(() => expect(host.el.textContent).toContain("line of text"));
  return view;
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

describe.each(DOCS)("SPEC-CORE-050 recording (%s)", (doc) => {
  it("saves thousandths and 1000 after one second without scrolling", async () => {
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(1000);
    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(saveWatchProgress).not.toHaveBeenCalled();
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalledTimes(1);
    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 500, 1000);
  });

  it("sends only the last position of a burst of scrolling", async () => {
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(400);
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalledTimes(1);
    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 500, 1000);
  });

  it.each([
    [98, false],
    [100, true],
  ])("scrollTop %i: written is %s (49 is not, 50 is)", async (top, written) => {
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(top);
    await debounceElapses();

    if (written) expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 50, 1000);
    else expect(saveWatchProgress).not.toHaveBeenCalled();
  });

  it("records a document exactly two screens tall", async () => {
    const host = makeHost(2000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(500);
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 500, 1000);
  });

  it("records nothing for a document shorter than two screens", async () => {
    const host = makeHost(1999, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(900);
    await debounceElapses();

    expect(saveWatchProgress).not.toHaveBeenCalled();
  });

  it("writes a pending position at once when the page is left", async () => {
    const host = makeHost(3000, 1000);
    const view = await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(1000);
    view.unmount();

    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 500, 1000);
  });

  it("ignores a failed save and keeps showing the text", async () => {
    vi.mocked(saveWatchProgress).mockRejectedValue(new Error("down"));
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).toHaveBeenCalled();
    expect(host.el.textContent).toContain("line of text");
  });

  it("records nothing when no scrollable ancestor exists", async () => {
    const host = makeHost(3000, 1000);
    host.el.style.overflowY = "visible";
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(host.el.scrollTop).toBe(1000);
  });
});

describe.each(DOCS)("SPEC-CORE-050 restore (%s)", (doc) => {
  it.each([
    [50, 100],
    [500, 1000],
    [899, 1798],
  ])("restores stored %i to scrollTop %i", async (position, expectedTop) => {
    stored(position);
    const host = makeHost(3000, 1000);
    await open(doc, host);

    await waitFor(() => expect(host.el.scrollTop).toBe(expectedTop));
  });

  it.each([
    ["49", 49, 1000],
    ["900", 900, 1000],
    ["a duration other than 1000", 500, 600],
    ["nothing stored", 0, 0],
  ])("does not restore %s", async (_label, position, duration) => {
    stored(position, duration);
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();

    expect(host.el.scrollTop).toBe(0);
  });

  it("applies the fraction to the current scrollable range", async () => {
    stored(500);
    const host = makeHost(5000, 1000);
    await open(doc, host);

    await waitFor(() => expect(host.el.scrollTop).toBe(2000));
  });

  it("does not restore a document shorter than two screens", async () => {
    stored(500);
    const host = makeHost(1500, 1000);
    await open(doc, host);
    await settle();

    expect(host.el.scrollTop).toBe(0);
  });

  it("does not record its own restore scroll", async () => {
    stored(500);
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await waitFor(() => expect(host.el.scrollTop).toBe(1000));
    await settle();
    vi.useFakeTimers();
    await debounceElapses();

    expect(saveWatchProgress).not.toHaveBeenCalled();
  });

  it("does not restore when a highlight is the explicit target", async () => {
    stored(500);
    const host = makeHost(3000, 1000);
    await open(doc, host, { highlight: "line" });
    await settle();

    expect(host.el.scrollTop).toBe(0);
  });

  it("does not restore when the URL carries a hash", async () => {
    window.location.hash = "#section";
    stored(500);
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();

    expect(host.el.scrollTop).toBe(0);
  });

  it("leaves the text at the top when the stored read fails", async () => {
    vi.mocked(getWatchProgress).mockRejectedValue(new Error("down"));
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();

    expect(host.el.scrollTop).toBe(0);
    expect(host.el.textContent).toContain("line of text");
  });

  it("abandons the restore when the reader scrolls before the read returns, and records their scroll", async () => {
    let resolve!: (v: { position: number; duration: number }) => void;
    vi.mocked(getWatchProgress).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();

    host.readerScrollTo(200);
    await act(async () => {
      resolve({ position: 800, duration: 1000 });
    });
    await settle();
    expect(host.el.scrollTop).toBe(200);

    vi.useFakeTimers();
    await debounceElapses();
    expect(saveWatchProgress).toHaveBeenCalledWith(FILE, 100, 1000);
  });

  it("restores at most once per open", async () => {
    stored(500);
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await waitFor(() => expect(host.el.scrollTop).toBe(1000));
    host.readerScrollTo(300);
    await settle();
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await settle();

    expect(host.el.scrollTop).toBe(300);
  });
});

describe.each(DOCS)("SPEC-CORE-050 without a nickname (%s)", (doc) => {
  beforeEach(() => {
    profile(null);
    addRecentlyPlayed(FILE);
  });

  it("restores from local storage and never asks the server", async () => {
    saveProgress(FILE, 500, 1000);
    const host = makeHost(3000, 1000);
    await open(doc, host);

    await waitFor(() => expect(host.el.scrollTop).toBe(1000));
    expect(getWatchProgress).not.toHaveBeenCalled();
  });

  it("ignores a local entry whose duration is not 1000", async () => {
    saveProgress(FILE, 500, 600);
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();

    expect(host.el.scrollTop).toBe(0);
  });

  it("writes to local storage and sends no position request", async () => {
    const host = makeHost(3000, 1000);
    await open(doc, host);
    await settle();
    vi.useFakeTimers();

    host.readerScrollTo(1000);
    await debounceElapses();

    expect(saveWatchProgress).not.toHaveBeenCalled();
    expect(getSavedPlayback(FILE)).toEqual({ position: 500, duration: 1000 });
  });
});
