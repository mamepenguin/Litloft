/**
 * SPEC-CORE-032 — what the inbox page shows and when it asks again.
 * Selection, done and gestures live in `inboxActions.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";
import { installInboxFetch, type InboxApiHarness } from "./helpers/inboxApi";
import {
  clockOf,
  inboxFile,
  inboxItem,
  localMoment,
  stage,
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

function renderInbox() {
  return render(tree());
}

function emitAndRerender(
  view: ReturnType<typeof render>,
  event: string,
  data: Record<string, unknown>,
) {
  lastEvent = { event, data };
  view.rerender(tree());
}

let api: InboxApiHarness;

function setup(state: Parameters<typeof installInboxFetch>[0]) {
  api = installInboxFetch(state);
  return api;
}

const today = localMoment(0, 10, 5);
const todayLater = localMoment(0, 11, 30);
const yesterday = localMoment(1, 15, 30);
const earlier = localMoment(5, 9, 15);

const todayItem = inboxItem(inboxFile("f1"), today);
const secondTodayItem = inboxItem(
  inboxFile("f2", { filename: "clip.png", title: "Second clip", has_thumbnail: true }),
  todayLater,
);
const yesterdayItem = inboxItem(inboxFile("f3"), yesterday);
const earlierItem = inboxItem(
  inboxFile("f4", { folder_path: "recipes/winter" }),
  earlier,
  "web_clip",
  "addon.made.up",
);

const ALL_FOUR = [todayItem, secondTodayItem, yesterdayItem, earlierItem];

function linkFor(id: string): HTMLElement {
  const link = document.querySelector<HTMLElement>(`a[href="/files/${id}?nav=inbox"]`);
  if (!link) throw new Error(`no inbox row links to ${id}`);
  return link;
}

function rowFor(id: string): HTMLElement {
  const link = linkFor(id);
  return (link.closest("li") ?? link.parentElement) as HTMLElement;
}

function rowText(id: string): string {
  return (rowFor(id).textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  route.search = new URLSearchParams("view=inbox");
  route.pathname = "/drive/main";
  lastEvent = null;
});

afterEach(() => {
  resetUploadStore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SPEC-CORE-032 the inbox page's header", () => {
  it("SPEC-CORE-032 names the screen and its drive", async () => {
    setup({ items: ALL_FOUR });
    renderInbox();

    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.body.textContent).toContain("main · 4 items"),
    );
  });

  it("SPEC-CORE-032 offers Mark all done while there is something to close", async () => {
    setup({ items: ALL_FOUR });
    renderInbox();

    expect(
      await screen.findByRole("button", { name: "Mark all done" }),
    ).toBeInTheDocument();
  });

  it("SPEC-CORE-032 shows the empty state, with no Mark all done", async () => {
    setup({ items: [] });
    renderInbox();

    expect(await screen.findByText("Inbox is empty")).toBeInTheDocument();
    expect(screen.getByText("New arrivals appear here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all done" })).toBeNull();
    expect(document.body.textContent).toContain("main · 0 items");
  });
});

describe("SPEC-CORE-032 the page's rows", () => {
  it("SPEC-CORE-032 groups by the viewer's local date, in order", async () => {
    setup({ items: ALL_FOUR });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    const text = document.body.textContent ?? "";
    const at = (needle: string) => {
      const index = text.indexOf(needle);
      expect(index, `${needle} is not on the page`).not.toBe(-1);
      return index;
    };
    expect(at("Today")).toBeLessThan(at("Yesterday"));
    expect(at("Yesterday")).toBeLessThan(at("Earlier"));
    expect(at("Arrival f1")).toBeLessThan(at("Second clip"));
    expect(at("Second clip")).toBeLessThan(at("Arrival f3"));
    expect(at("Arrival f3")).toBeLessThan(at("Arrival f4"));
  });

  it("SPEC-CORE-032 opens each row at the file detail with nav=inbox", async () => {
    setup({ items: ALL_FOUR });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    for (const item of ALL_FOUR) {
      expect(linkFor(item.file.id)).toHaveAttribute(
        "href",
        `/files/${item.file.id}?nav=inbox`,
      );
    }
  });

  it("SPEC-CORE-032 shows the file's name and its thumbnail", async () => {
    setup({
      items: [
        inboxItem(inboxFile("f1", { has_thumbnail: true }), today),
      ],
    });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f1")).toContain("Arrival f1");
    const image = rowFor("f1").querySelector("img");
    expect(image?.getAttribute("src")).toBe("/api/files/f1/thumbnail");
  });

  it("SPEC-CORE-032 shows a type icon instead of a missing thumbnail", async () => {
    setup({
      items: [
        inboxItem(inboxFile("f1", { file_type: "document", mime_type: "text/plain" }), today),
      ],
    });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowFor("f1").querySelector("img")).toBeNull();
    expect(rowFor("f1").querySelector("svg")).not.toBeNull();
  });

  it("SPEC-CORE-032 shows today as HH:mm", async () => {
    setup({ items: [todayItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f1")).toContain(clockOf(today));
  });

  it("SPEC-CORE-032 shows yesterday as Yesterday HH:mm", async () => {
    setup({ items: [yesterdayItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f3")).toContain(`Yesterday ${clockOf(yesterday)}`);
  });

  it("SPEC-CORE-032 shows an older arrival as a date, not a time", async () => {
    setup({ items: [earlierItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    const text = rowText("f4");
    expect(text).not.toMatch(/\b\d{2}:\d{2}\b/);
    expect(text).not.toContain("Yesterday");
    expect(text).toMatch(/\d/);
  });

  it("SPEC-CORE-032 translates the source label through its key", async () => {
    setup({ items: [todayItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f1")).not.toContain("inbox.sourceUpload");
  });

  it("SPEC-CORE-032 falls back to the source when its key is unknown", async () => {
    setup({ items: [earlierItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f4")).toContain("web_clip");
  });

  it("SPEC-CORE-032 gives a folder a trailing slash and the root its own word", async () => {
    setup({ items: [todayItem, earlierItem] });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    expect(rowText("f1")).toContain("Root");
    expect(rowText("f4")).toContain("recipes/winter/");
  });
});

describe("SPEC-CORE-032 the page's upload zone", () => {
  it("SPEC-CORE-032 mounts one zone that lands files in the drive root as arrivals", async () => {
    setup({ items: ALL_FOUR });
    const view = renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    const zones = view.container.querySelectorAll("[data-upload-zone]");
    expect(zones).toHaveLength(1);
    zones[0].dispatchEvent(
      new CustomEvent("upload-files", {
        detail: [new File(["x"], "note.txt", { type: "text/plain" })],
      }),
    );

    await waitFor(() =>
      expect(api.calls.some((call) => call.url.includes("/upload/init"))).toBe(
        true,
      ),
    );
    const init = api.calls.find((call) => call.url.includes("/upload/init"))!;
    expect(init.body).toEqual(
      expect.objectContaining({ folder_path: "", inbox_source: "upload" }),
    );
  });
});

describe("SPEC-CORE-032 reloading the list", () => {
  it.each(["inbox.updated", "drive.structure_changed"])(
    "SPEC-CORE-032 refetches from the top on %s for the current drive",
    async (event) => {
      setup({ items: ALL_FOUR });
      const view = renderInbox();
      await screen.findByRole("heading", { name: "Inbox" });
      const before = api.listCalls().length;
      expect(before).toBeGreaterThan(0);

      api.state.items = [yesterdayItem];
      emitAndRerender(view, event, { drive: "main" });

      await waitFor(() =>
        expect(api.listCalls().length).toBeGreaterThan(before),
      );
      await waitFor(() => expect(screen.queryByText("Arrival f1")).toBeNull());
      expect(screen.getByText("Arrival f3")).toBeInTheDocument();
    },
  );

  it("SPEC-CORE-032 ignores another drive's event", async () => {
    setup({ items: ALL_FOUR });
    const view = renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });
    const before = api.listCalls().length;

    api.state.items = [];
    emitAndRerender(view, "inbox.updated", { drive: "other" });
    await act(async () => {});

    expect(api.listCalls().length).toBe(before);
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 keeps what it shows when a reload fails", async () => {
    setup({ items: ALL_FOUR });
    const view = renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });

    api.state.failList = true;
    emitAndRerender(view, "inbox.updated", { drive: "main" });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Arrival f1")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-032 I18 a row's stage", () => {
  function flush(ms = 0) {
    return act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function renderStaged(
    items: InboxItemWire[],
    processing: NonNullable<Parameters<typeof installInboxFetch>[0]["processing"]>,
  ) {
    setup({ items, processing });
    const view = renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });
    await waitFor(() => expect(api.processingCalls().length).toBeGreaterThan(0));
    return view;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("SPEC-CORE-032 I18 shows a required running stage's label with a spinner", async () => {
    const answer = { stages: [stage("statusPending", "running")], ready: false };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Pending");
    expect(rowFor("f1").querySelector("svg.lucide-loader-circle")).not.toBeNull();
  });

  it("SPEC-CORE-032 I18 translates an addon stage through its global key", async () => {
    const answer = {
      stages: [
        stage("search", "running", {
          i18nKey: "intelligence.processing.search",
        }),
      ],
      ready: false,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Search index");
    expect(rowText("f1")).not.toContain("intelligence.processing.search");
  });

  it("SPEC-CORE-032 I18 shows the first required stage that is pending or running", async () => {
    const answer = {
      stages: [
        stage("statusPending", "done", { i18nKey: "upload.stageSaved" }),
        stage("statusPending", "pending"),
      ],
      ready: false,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Pending");
  });

  it("SPEC-CORE-032 I18 shows unavailable over a running stage, without a spinner", async () => {
    const answer = {
      stages: [
        stage("statusPending", "running"),
        stage("integration", "unavailable", { i18nKey: "upload.statusPending" }),
      ],
      ready: false,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Not available right now");
    expect(rowText("f1")).not.toContain("Pending");
    expect(rowFor("f1").querySelector("svg.lucide-loader-circle")).toBeNull();
  });

  it("SPEC-CORE-032 I18 shows Ready with its check when the answer is ready", async () => {
    const answer = {
      stages: [stage("statusPending", "done")],
      ready: true,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Ready");
    expect(rowFor("f1").querySelector("svg.lucide-check")).not.toBeNull();
  });

  it("SPEC-CORE-032 I18 keeps the failure mark beside Ready", async () => {
    const answer = {
      stages: [
        stage("statusPending", "done"),
        stage("statusError", "failed", { required: false }),
      ],
      ready: true,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Ready");
    const mark = rowFor("f1").querySelector("svg.lucide-circle-alert");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("class")).toContain("text-danger");
  });

  it("SPEC-CORE-032 I18 lets a non-required running stage decide nothing", async () => {
    const answer = {
      stages: [
        stage("statusPending", "done"),
        stage("statusPending", "running", { required: false }),
      ],
      ready: true,
    };
    await renderStaged([todayItem], { f1: answer });

    expect(rowText("f1")).toContain("Ready");
  });

  it("SPEC-CORE-032 I18 shows no stage for a file the endpoint leaves out", async () => {
    await renderStaged([todayItem], {});

    expect(rowText("f1")).not.toContain("Ready");
    expect(rowText("f1")).not.toContain("Pending");
    expect(rowText("f1")).not.toContain("Not available right now");
  });

  it("SPEC-CORE-032 I18 stops polling an unavailable row and keeps polling the other", async () => {
    setup({
      items: [todayItem, yesterdayItem],
      processing: {
        f1: {
          stages: [stage("integration", "unavailable", { i18nKey: "upload.stageUnavailable" })],
          ready: false,
        },
        f3: { stages: [stage("statusPending", "running")], ready: false },
      },
    });
    renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });
    await waitFor(() => expect(api.processingCalls().length).toBe(1));

    await flush(30_000);
    await waitFor(() => expect(api.processingCalls().length).toBeGreaterThan(1));

    const last = api.processingCalls().at(-1)!;
    expect((last.body as { file_ids: string[] }).file_ids).toEqual(["f3"]);
  });

  it("SPEC-CORE-032 I18 still refreshes an unavailable row on its event", async () => {
    setup({
      items: [todayItem],
      processing: {
        f1: {
          stages: [stage("integration", "unavailable", { i18nKey: "upload.stageUnavailable" })],
          ready: false,
        },
      },
    });
    const view = renderInbox();
    await screen.findByRole("heading", { name: "Inbox" });
    await waitFor(() => expect(api.processingCalls().length).toBe(1));

    emitAndRerender(view, "processing.updated", { file_ids: ["f1"] });
    await flush(0);

    await waitFor(() => expect(api.processingCalls().length).toBeGreaterThan(1));
    expect(
      (api.processingCalls().at(-1)!.body as { file_ids: string[] }).file_ids,
    ).toEqual(["f1"]);
  });

  it("SPEC-CORE-032 I18 asks for its loaded rows in one batch of at most 100", async () => {
    const answer = { stages: [], ready: false };
    await renderStaged([todayItem, secondTodayItem, yesterdayItem], {
      f1: answer,
      f2: answer,
      f3: answer,
    });

    const ids = (api.processingCalls()[0].body as { file_ids: string[] }).file_ids;
    expect(new Set(ids)).toEqual(new Set(["f1", "f2", "f3"]));
    expect(ids.length).toBeLessThanOrEqual(100);
  });
});
