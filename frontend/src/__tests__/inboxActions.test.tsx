/**
 * SPEC-CORE-032 — closing arrivals from the page: the row, the selection
 * bar, the all-done button, the undo toast, and the two gestures a touch
 * screen has instead of a row's controls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";
import { installInboxFetch, type InboxApiHarness } from "./helpers/inboxApi";
import {
  inboxFile,
  inboxItem,
  localMoment,
  type InboxItemWire,
} from "./helpers/inboxData";

const route = vi.hoisted(() => ({
  search: new URLSearchParams("view=inbox"),
  pathname: "/drive/main",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "main" }),
  useSearchParams: () => route.search,
  usePathname: () => route.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: false, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
  useOverlaySidebar: vi.fn(),
  useOverlaySidebarWhen: vi.fn(),
}));

import DrivePage from "@/app/drive/[name]/page";
import { resetUploadStore } from "@/hooks/useUpload";

/**
 * jsdom has no PointerEvent, and Testing Library falls back to a plain
 * Event, which drops `pointerType` and the coordinates. Browsers that
 * report a coarse pointer always have it.
 */
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventPolyfill,
  });
}

for (const method of ["setPointerCapture", "releasePointerCapture"]) {
  if (!(method in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, method, {
      configurable: true,
      writable: true,
      value: () => {},
    });
  }
}

let lastEvent: WebSocketEvent | null = null;

function tree() {
  return (
    <ToastProvider>
      <ClipboardProvider>
        <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
          <DrivePage />
        </WebSocketContext.Provider>
      </ClipboardProvider>
    </ToastProvider>
  );
}

let api: InboxApiHarness;

function setup(state: Parameters<typeof installInboxFetch>[0]) {
  api = installInboxFetch(state);
  return api;
}

const now = localMoment(0, 10, 5);
const older = localMoment(1, 9, 0);
const f1 = inboxItem(inboxFile("f1"), now);
const f2 = inboxItem(inboxFile("f2"), localMoment(0, 8, 0));

function linkFor(id: string): HTMLElement {
  const link = document.querySelector<HTMLElement>(`a[href="/files/${id}?nav=inbox"]`);
  if (!link) throw new Error(`no inbox row links to ${id}`);
  return link;
}

/** The visible word Done, whether the row's accessible name adds the file. */
function doneButtons(): HTMLElement[] {
  return screen
    .queryAllByText("Done")
    .map((el) => el.closest("button"))
    .filter((el): el is HTMLButtonElement => el !== null);
}

function checkboxes() {
  return screen.getAllByRole("checkbox") as HTMLElement[];
}

async function open(items: InboxItemWire[]) {
  setup({ items });
  render(tree());
  await screen.findByRole("heading", { name: "Inbox" });
}

beforeEach(() => {
  route.search = new URLSearchParams("view=inbox");
  lastEvent = null;
});

afterEach(() => {
  resetUploadStore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-032 done from a row", () => {
  it("SPEC-CORE-032 closes the row and offers Undo", async () => {
    await open([f1, f2]);
    doneButtons()[0].click();

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    expect(api.doneCalls()[0].body).toEqual({ file_ids: ["f1"] });
    expect(api.doneCalls()[0].url).toContain("/api/drives/main/inbox/done");

    await waitFor(() => expect(screen.queryByText("Arrival f1")).toBeNull());
    expect(screen.getByText("Arrival f2")).toBeInTheDocument();
    expect(screen.getByText("Marked 1 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("SPEC-CORE-032 undoes with the done_at the answer named and restores the order", async () => {
    await open([f1, f2]);
    doneButtons()[0].click();
    await screen.findByText("Marked 1 done");

    api.state.items = [f1, f2];
    screen.getByRole("button", { name: "Undo" }).click();

    await waitFor(() => expect(api.undoCalls()).toHaveLength(1));
    expect(api.undoCalls()[0].body).toEqual({ done_at: "2026-11-04T10:00:00.000000Z" });
    await waitFor(() =>
      expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2),
    );
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.indexOf("/files/f1?nav=inbox")).toBeLessThan(
      hrefs.indexOf("/files/f2?nav=inbox"),
    );
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 shows no toast when nothing was closed", async () => {
    setup({ items: [f1, f2], doneCount: 0 });
    render(tree());
    await screen.findByRole("heading", { name: "Inbox" });
    doneButtons()[0].click();

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    expect(screen.queryByText("Marked 0 done")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});

describe("SPEC-CORE-032 I13 a done request that has not answered", () => {
  it("SPEC-CORE-032 I13 keeps the rows hidden from every reload while it is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setup({ items: [f1, f2], doneGate: gate });
    const view = render(tree());
    await screen.findByRole("heading", { name: "Inbox" });

    doneButtons()[0].click();
    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("Arrival f1")).toBeNull());

    // The server has not committed yet, so a reload still carries the row.
    api.state.items = [f1, f2];
    lastEvent = { event: "inbox.updated", data: { drive: "main" } };
    view.rerender(tree());
    await act(async () => {});

    expect(screen.queryByText("Arrival f1")).toBeNull();

    release();
    await act(async () => {});
    await waitFor(() => expect(screen.getByText("Arrival f2")).toBeInTheDocument());
    expect(screen.queryByText("Arrival f1")).toBeNull();
  });

  it("SPEC-CORE-032 I13 shows the rows again when the request fails", async () => {
    setup({ items: [f1, f2], failDone: true });
    render(tree());
    await screen.findByRole("heading", { name: "Inbox" });
    doneButtons()[0].click();

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("Arrival f1")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});

describe("SPEC-CORE-032 Mark all done", () => {
  it("SPEC-CORE-032 closes everything up to the newest loaded arrival", async () => {
    setup({ items: [f1, f2, inboxItem(inboxFile("f3"), older)], doneCount: 3 });
    render(tree());
    await screen.findByRole("heading", { name: "Inbox" });

    screen.getByRole("button", { name: "Mark all done" }).click();

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    expect(api.doneCalls()[0].body).toEqual({
      all: true,
      up_to: f1.arrived_at,
    });
    expect(screen.getByText("Marked 3 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-032 the selection bar", () => {
  it("SPEC-CORE-032 counts the selection and offers Done, Move and Tag", async () => {
    await open([f1, f2]);
    fireEvent.click(checkboxes()[0]);
    fireEvent.click(checkboxes()[1]);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(doneButtons().length).toBeGreaterThan(2);
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(screen.getByText("Tag")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 closes the selection as one done request", async () => {
    await open([f1, f2]);
    fireEvent.click(checkboxes()[0]);
    fireEvent.click(checkboxes()[1]);

    doneButtons().at(-1)!.click();

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    expect(api.doneCalls()[0].body).toEqual({ file_ids: ["f1", "f2"] });
    expect(screen.getByText("Marked 2 done")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 clears the selection from its cancel control", async () => {
    await open([f1, f2]);
    fireEvent.click(checkboxes()[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    screen.getByRole("button", { name: "Deselect" }).click();

    expect(screen.queryByText("1 selected")).toBeNull();
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 sends a tag write in batches of at most 100", async () => {
    const items = Array.from({ length: 105 }, (_, index) =>
      inboxItem(inboxFile(`f${index}`), now),
    );
    await open(items);
    for (const box of checkboxes()) fireEvent.click(box);
    expect(screen.getByText("105 selected")).toBeInTheDocument();

    screen.getByText("Tag").closest("button")!.click();
    fireEvent.change(screen.getByPlaceholderText("tag1, tag2..."), {
      target: { value: "soup" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("tag1, tag2..."), {
      key: "Enter",
    });

    await waitFor(() => expect(api.tagCalls()).toHaveLength(2));
    const chunks = api.tagCalls().map((call) => call.body as { ids: string[]; tags: string[] });
    for (const chunk of chunks) {
      expect(chunk.ids.length).toBeLessThanOrEqual(100);
      expect(chunk.tags).toEqual(["soup"]);
    }
    expect(new Set(chunks.flatMap((chunk) => chunk.ids)).size).toBe(105);
  });

  it("SPEC-CORE-032 sends a move in batches of at most 100", async () => {
    const items = Array.from({ length: 105 }, (_, index) =>
      inboxItem(inboxFile(`f${index}`), now),
    );
    setup({
      items,
      folders: [{ name: "archive", path: "archive" }],
    });
    render(tree());
    await screen.findByRole("heading", { name: "Inbox" });
    for (const box of checkboxes()) fireEvent.click(box);

    screen.getByRole("button", { name: "Move" }).click();
    await screen.findByText("Select destination");
    fireEvent.click(screen.getByText("archive"));
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(api.moveCalls()).toHaveLength(2));
    const chunks = api.moveCalls().map(
      (call) => call.body as { ids: string[]; target_folder_path: string },
    );
    for (const chunk of chunks) {
      expect(chunk.ids.length).toBeLessThanOrEqual(100);
      expect(chunk.target_folder_path).toBe("archive");
    }
    expect(new Set(chunks.flatMap((chunk) => chunk.ids)).size).toBe(105);
  });
});

describe("SPEC-CORE-032 the pointer-type controls", () => {
  function pointer(coarse: boolean, reducedMotion = false) {
    const stub = (query: string) => ({
      matches: query.includes("pointer: coarse")
        ? coarse
        : query.includes("prefers-reduced-motion: reduce")
          ? reducedMotion
          : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("matchMedia", stub);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: stub,
    });
  }

  function rect(width = 300) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 60,
      width,
      height: 60,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width);
  }

  function point(element: HTMLElement, type: string, x: number, y: number) {
    fireEvent.pointerDown(element, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 250,
      clientY: 100,
    });
    if (type !== "down") {
      fireEvent.pointerMove(element, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
      });
    }
    fireEvent.pointerUp(element, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y,
    });
  }

  it("SPEC-CORE-032 marks done on a swipe left past a third of the row", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);
    point(linkFor("f1"), "up", 100, 100);

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
    expect(api.doneCalls()[0].body).toEqual({ file_ids: ["f1"] });
    expect(screen.getByText("Marked 1 done")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 leaves the row alone when the swipe is short", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);
    point(linkFor("f1"), "up", 200, 100);

    await act(async () => {});
    expect(api.doneCalls()).toHaveLength(0);
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 treats a mostly vertical gesture as a scroll", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);
    point(linkFor("f1"), "up", 240, -20);

    await act(async () => {});
    expect(api.doneCalls()).toHaveLength(0);
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 still marks done by swipe under reduced motion", async () => {
    pointer(true, true);
    rect(300);
    await open([f1, f2]);
    point(linkFor("f1"), "up", 100, 100);

    await waitFor(() => expect(api.doneCalls()).toHaveLength(1));
  });

  it("SPEC-CORE-032 does not swipe on a fine pointer", async () => {
    pointer(false);
    rect(300);
    await open([f1, f2]);
    point(linkFor("f1"), "up", 100, 100);

    await act(async () => {});
    expect(api.doneCalls()).toHaveLength(0);
  });

  it("SPEC-CORE-032 selects a row on a 500 ms long press and opens no menu", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);
    const link = linkFor("f1");

    fireEvent.pointerDown(link, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.getByText("1 selected")).toBeInTheDocument();

    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    link.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("SPEC-CORE-032 does not select on a short press", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);

    fireEvent.pointerDown(linkFor("f1"), {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    fireEvent.pointerUp(linkFor("f1"), {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });

    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("SPEC-CORE-032 toggles rows by tapping once selection mode is on", async () => {
    pointer(true);
    rect(300);
    await open([f1, f2]);

    fireEvent.pointerDown(linkFor("f1"), {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    fireEvent.pointerUp(linkFor("f1"), {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(linkFor("f2"));
    await waitFor(() => expect(screen.getByText("2 selected")).toBeInTheDocument());

    screen.getByRole("button", { name: "Deselect" }).click();
    expect(screen.queryByText("2 selected")).toBeNull();
  });
});
