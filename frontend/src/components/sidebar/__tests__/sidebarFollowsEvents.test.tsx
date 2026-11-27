/**
 * SPEC-CORE-188 through the whole `Sidebar`: a watched event re-reads the
 * drive's lists (I1), open inputs survive or close with their collection
 * (I10), and an own write never toasts because its re-read failed (I11).
 * Requests are answered at `fetch`; events go through the real context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { Sidebar } from "@/components/Sidebar";
import type { WebSocketEvent } from "@/types";
import { type Col, collectionRow, rowsFor, sidebarApi } from "@/__tests__/helpers/sidebarHarness";
import { NAME_IN_USE, deferred, json, nameInUse } from "@/__tests__/helpers/nameInUse";
import en from "@/messages-core/en.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
    catalogueDrive: null,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/sidebar/AddonNavRows", () => ({ AddonNavRows: () => null }));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const COLLECTIONS_GET = /^\/api\/drives\/main\/collections$/;
const C1 = /^\/api\/drives\/main\/collections\/c1$/;

let api: ReturnType<typeof sidebarApi>;
let collections: Col[] | "fail";
let tags: { name: string; count: number }[];
let view: ReturnType<typeof render>;

function element(lastEvent: WebSocketEvent | null) {
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <Sidebar />
    </WebSocketContext.Provider>
  );
}

async function show(initial: Col[]) {
  collections = initial;
  tags = [];
  api = sidebarApi({ collections: initial, smart: [] });
  api.on("GET", COLLECTIONS_GET, () =>
    collections === "fail" ? json({ detail: "boom" }, 500) : json(collections.map((c) => collectionRow(c))),
  );
  api.on("GET", /^\/api\/drives\/main\/tags$/, () => json(tags));
  vi.stubGlobal("fetch", api.fetch);
  view = render(element(null));
  const names = initial.map((c) => c.name);
  await waitFor(() => expect(rowsFor(names)).toHaveLength(names.length));
}

function send(event: string) {
  act(() => {
    view.rerender(element({ event, data: { drive: "main" } }));
  });
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const createInput = () =>
  screen.queryByPlaceholderText(en.sidebar.collectionNamePlaceholder) as HTMLInputElement | null;

async function openMenu(name: string) {
  const [{ row }] = rowsFor([name]);
  fireEvent.contextMenu(row);
  return screen.findByRole("menuitem", { name: en.sidebar.renameCollection });
}

async function startRename(name: string, typed: string) {
  fireEvent.click(await openMenu(name));
  const input = await waitFor(() => screen.getByDisplayValue(name) as HTMLInputElement);
  fireEvent.change(input, { target: { value: typed } });
  return input;
}

beforeEach(() => {
  localStorage.clear();
  toast.error.mockClear();
  toast.success.mockClear();
  toast.info.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-188 I1 the sidebar shows what changed elsewhere", () => {
  it("SPEC-CORE-188 I1 a renamed and an added collection and a new tag appear after drive.collections_changed", async () => {
    await show([{ id: "c1", name: "Trip", item_count: 1 }]);
    collections = [
      { id: "c1", name: "Voyage", item_count: 2 },
      { id: "c2", name: "Zed", item_count: 0 },
    ];
    tags = [{ name: "soup", count: 1 }];

    send("drive.collections_changed");

    await waitFor(() => expect(rowsFor(["Voyage", "Zed"])).toHaveLength(2));
    expect(rowsFor(["Trip"])).toHaveLength(0);
    await waitFor(() => expect(screen.getByText("soup")).toBeInTheDocument());
  });
});

describe("SPEC-CORE-188 I10 open inputs when a round replaces the list", () => {
  it("SPEC-CORE-188 I10 a rename of a collection still listed stays open with its typed text", async () => {
    await show([{ id: "c1", name: "Trip" }]);
    await startRename("Trip", "Trip edited");

    collections = [
      { id: "c1", name: "Trip" },
      { id: "c2", name: "Zed" },
    ];
    send("drive.collections_changed");

    await waitFor(() => expect(rowsFor(["Zed"])).toHaveLength(1));
    expect(screen.getByDisplayValue("Trip edited")).toBeInTheDocument();
    expect(api.count("PUT", C1)).toBe(0);
  });

  it("SPEC-CORE-188 I10 a create input in its 409 state stays open with its text and its line", async () => {
    await show([{ id: "c1", name: "Trip" }]);
    api.on("POST", COLLECTIONS_GET, nameInUse);
    fireEvent.click(screen.getByRole("button", { name: en.sidebar.createCollection }));
    const input = await waitFor(() => {
      expect(createInput()).not.toBeNull();
      return createInput()!;
    });
    fireEvent.change(input, { target: { value: "trip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(createInput()?.getAttribute("aria-invalid")).toBe("true"));

    collections = [
      { id: "c1", name: "Trip" },
      { id: "c2", name: "Zed" },
    ];
    send("drive.collections_changed");

    await waitFor(() => expect(rowsFor(["Zed"])).toHaveLength(1));
    const after = createInput();
    expect(after).not.toBeNull();
    expect(after!.value).toBe("trip");
    expect(after!.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain(NAME_IN_USE);
  });

  it("SPEC-CORE-188 I10 a rename input closes when its collection leaves the list, and nothing is sent for it", async () => {
    await show([
      { id: "c1", name: "Trip" },
      { id: "c2", name: "Zed" },
    ]);
    await startRename("Trip", "Trip edited");

    collections = [{ id: "c2", name: "Zulu" }];
    send("drive.collections_changed");

    await waitFor(() => expect(rowsFor(["Zulu"])).toHaveLength(1));
    await waitFor(() => expect(screen.queryByDisplayValue("Trip edited")).toBeNull());
    await settle();
    expect(api.count("PUT", C1)).toBe(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-188 I10 an open context menu closes when its collection leaves the list", async () => {
    await show([
      { id: "c1", name: "Trip" },
      { id: "c2", name: "Zed" },
    ]);
    await openMenu("Trip");

    collections = [{ id: "c2", name: "Zed" }];
    send("drive.collections_changed");

    await waitFor(() => expect(rowsFor(["Trip"])).toHaveLength(0));
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: en.sidebar.renameCollection })).toBeNull(),
    );
    expect(screen.queryByRole("menuitem", { name: en.sidebar.deleteCollection })).toBeNull();
  });

  it("SPEC-CORE-188 I10 a rename in flight whose collection leaves the list and then answers 404 shows no toast", async () => {
    await show([
      { id: "c1", name: "Trip" },
      { id: "c2", name: "Zed" },
    ]);
    const pending = deferred<Response>();
    api.on("PUT", C1, () => pending.promise);
    const input = await startRename("Trip", "Voyage");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.count("PUT", C1)).toBe(1));

    collections = [{ id: "c2", name: "Zulu" }];
    send("drive.collections_changed");
    await waitFor(() => expect(rowsFor(["Zulu"])).toHaveLength(1));

    await act(async () => {
      pending.resolve(json({ detail: "Collection not found" }, 404));
    });
    await settle();
    await settle();
    expect(screen.queryByDisplayValue("Voyage")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(api.count("PUT", C1)).toBe(1);
  });
});

describe("SPEC-CORE-188 I11 an own write never toasts because its re-read failed", () => {
  it("SPEC-CORE-188 I11 create", async () => {
    await show([{ id: "c1", name: "Trip" }]);
    api.on("POST", COLLECTIONS_GET, () => {
      collections = "fail";
      return json(collectionRow({ id: "c2", name: "Zed" }), 201);
    });
    fireEvent.click(screen.getByRole("button", { name: en.sidebar.createCollection }));
    const input = await waitFor(() => {
      expect(createInput()).not.toBeNull();
      return createInput()!;
    });
    fireEvent.change(input, { target: { value: "Zed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.count("GET", COLLECTIONS_GET)).toBeGreaterThan(1));
    await settle();
    await settle();
    expect(api.count("POST", COLLECTIONS_GET)).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-188 I11 rename", async () => {
    await show([{ id: "c1", name: "Trip" }]);
    api.on("PUT", C1, () => {
      collections = "fail";
      return json(collectionRow({ id: "c1", name: "Voyage" }));
    });
    const input = await startRename("Trip", "Voyage");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.count("GET", COLLECTIONS_GET)).toBeGreaterThan(1));
    await settle();
    await settle();
    expect(api.count("PUT", C1)).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-188 I11 delete", async () => {
    await show([{ id: "c1", name: "Trip" }]);
    api.on("DELETE", C1, () => {
      collections = "fail";
      return new Response(null, { status: 204 });
    });
    await openMenu("Trip");
    fireEvent.click(screen.getByRole("menuitem", { name: en.sidebar.deleteCollection }));

    await waitFor(() => expect(api.count("DELETE", C1)).toBe(1));
    await waitFor(() => expect(api.count("GET", COLLECTIONS_GET)).toBeGreaterThan(1));
    await settle();
    await settle();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-188 I4 the drag-and-drop add re-reads through the sequenced read", () => {
  it("SPEC-CORE-188 I4 its re-read answering after a later round does not replace the round's list", async () => {
    await show([{ id: "c1", name: "Trip", item_count: 0 }]);
    const ITEMS = /^\/api\/drives\/main\/collections\/c1\/items$/;
    const late = deferred<Response>();
    let holdNextGet = false;
    api.on("POST", ITEMS, () => {
      holdNextGet = true;
      return json({});
    });
    api.on("GET", COLLECTIONS_GET, () => {
      if (holdNextGet) {
        holdNextGet = false;
        return late.promise;
      }
      return collections === "fail"
        ? json({ detail: "boom" }, 500)
        : json(collections.map((c) => collectionRow(c)));
    });

    const [{ row }] = rowsFor(["Trip"]);
    const dataTransfer = {
      types: ["application/x-file-ids"],
      getData: (t: string) => (t === "application/x-file-ids" ? JSON.stringify(["f1"]) : ""),
      setData: () => {},
      effectAllowed: "all",
      dropEffect: "",
    };
    await act(async () => {
      fireEvent(row, createEvent.dragOver(row, { dataTransfer }));
      fireEvent.drop(row, { dataTransfer });
    });
    await waitFor(() => expect(api.count("POST", ITEMS)).toBe(1));
    await waitFor(() => expect(holdNextGet).toBe(false));

    collections = [
      { id: "c1", name: "Trip", item_count: 1 },
      { id: "c2", name: "Zed" },
    ];
    send("drive.collections_changed");
    await waitFor(() => expect(rowsFor(["Zed"])).toHaveLength(1));

    await act(async () => {
      late.resolve(json([collectionRow({ id: "c1", name: "Trip", item_count: 0 })]));
    });
    await settle();
    await settle();
    expect(rowsFor(["Trip", "Zed"])).toHaveLength(2);
  });
});
