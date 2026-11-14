/**
 * SPEC-CORE-102 on the folder page: the Home row of a pinned folder's `…` menu.
 * `usePinnedFolders` runs for real against a server answered at `fetch`, so
 * the pin state and the Home state the menu shows come from the same place a
 * real page reads them from.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { House, HousePlus } from "lucide-react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeEnabled", () => ({ useTreeEnabled: () => ({ enabled: false }) }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
  saveListSnapshot: vi.fn(),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: () => ({
    creatingFolder: false,
    newFolderName: "",
    folderError: null,
    setCreatingFolder: vi.fn(),
    setNewFolderName: vi.fn(),
    setFolderError: vi.fn(),
    handleCreateFolder: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [{ id: "f1", filename: "f1.mp4", file_type: "video" }],
    folders: [],
    total: 1,
    loading: false,
    loadingMore: false,
    hasMore: false,
    pagesLoaded: 1,
    sentinelRef: { current: null },
    reset: vi.fn(),
    setFiles: vi.fn(),
    setPaginatedTotal: vi.fn(),
    setFolders: vi.fn(),
    isRecent: false,
    hasProfile: false,
    snapshotKey: "key",
    hydratedScrollY: null,
  }),
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---- the server, answered at fetch --------------------------------------------

const DRIVE = "main";
const FAILED = "Couldn't change the Home entry";

/** Pinned path → whether it is on Home. */
let pins = new Map<string, boolean>();
let putAnswer: "ok" | "fail" | "missing" | "pending" = "ok";
let releasePut: (() => void) | null = null;
const puts: { drive: string; body: { kind: string; id: string; on_home: boolean } }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const noContent = () => new Response(null, { status: 204 });

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://x");
  const method = (init?.method ?? "GET").toUpperCase();
  const m = /^\/api\/drives\/([^/]+)\/(pins|home-shortcuts)$/.exec(url.pathname);
  if (!m) return json({ detail: "Not Found" }, 404);
  const drive = decodeURIComponent(m[1]);
  if (m[2] === "pins") {
    if (method === "GET") return json([...pins].map(([path, on_home]) => ({ path, on_home })));
    if (method === "POST") {
      const { path } = JSON.parse(String(init!.body));
      pins.set(path, false);
      return json({ path, on_home: false }, 201);
    }
    if (method === "DELETE") {
      pins.delete(url.searchParams.get("path")!);
      return noContent();
    }
  }
  if (method === "GET") {
    return json(
      [...pins].filter(([, on]) => on).map(([path]) => ({ kind: "pin", id: path, name: path.split("/").at(-1), query: null, file_type: null })),
    );
  }
  const body = JSON.parse(String(init!.body));
  puts.push({ drive, body });
  if (putAnswer === "fail") return json({ detail: "boom" }, 500);
  if (putAnswer === "missing") return json({ detail: "Not Found" }, 404);
  const apply = () => {
    if (body.kind === "pin" && pins.has(body.id)) pins.set(body.id, body.on_home);
  };
  if (putAnswer === "pending") {
    return new Promise<Response>((resolve) => {
      releasePut = () => {
        apply();
        resolve(noContent());
      };
    });
  }
  apply();
  return noContent();
});

// ---- helpers -----------------------------------------------------------------

const PUT_ON = "Put on Home";
const REMOVE = "Remove from Home";

function openMenu() {
  fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[0]);
}
const items = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
const homeRow = (label: string) => screen.queryByRole("menuitem", { name: label });

async function renderFolder(folderPath: string) {
  render(<FolderBrowser driveName={DRIVE} folderPath={folderPath} />);
  await waitFor(() => expect(fetchStub).toHaveBeenCalled());
  await act(async () => {});
}

async function openAndFind(label: string) {
  openMenu();
  return await screen.findByRole("menuitem", { name: label });
}

function indexOf(label: RegExp) {
  return items().findIndex((t) => label.test(t));
}


const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");
function iconClass(Icon: typeof House): string[] {
  const { container, unmount } = render(<Icon />);
  const classes = iconOf(container);
  unmount();
  return classes;
}
const ICON = { ["Put on Home"]: HousePlus, ["Remove from Home"]: House } as const;
function expectRowIcon(label: string) {
  const expected = iconClass(ICON[label as keyof typeof ICON]);
  expect(expected).toHaveLength(1);
  expect(iconOf(screen.getByRole("menuitem", { name: label }))).toEqual(expected);
}

beforeEach(() => {
  vi.clearAllMocks();
  pins = new Map();
  putAnswer = "ok";
  releasePut = null;
  puts.length = 0;
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-102 I11 the Home row on a pinned folder", () => {
  it("SPEC-CORE-102 I11 offers Put on Home directly after Unpin while the folder is off Home", async () => {
    pins.set("recipes", false);
    await renderFolder("recipes");

    await openAndFind(PUT_ON);

    expect(homeRow(REMOVE)).toBeNull();
    expectRowIcon(PUT_ON);
    expect(indexOf(/^Unpin this folder$/)).toBeGreaterThanOrEqual(0);
    expect(indexOf(new RegExp(`^${PUT_ON}$`))).toBe(indexOf(/^Unpin this folder$/) + 1);
  });

  it("SPEC-CORE-102 I11 offers Remove from Home directly after Unpin while the folder is on Home", async () => {
    pins.set("recipes", true);
    await renderFolder("recipes");

    await openAndFind(REMOVE);

    expect(homeRow(PUT_ON)).toBeNull();
    expectRowIcon(REMOVE);
    expect(indexOf(new RegExp(`^${REMOVE}$`))).toBe(indexOf(/^Unpin this folder$/) + 1);
  });

  it("SPEC-CORE-102 I11 shows no Home row on a folder that is not pinned, and Put on Home once it is", async () => {
    pins.set("recipes", true);
    await renderFolder("photos");

    openMenu();
    const pin = await screen.findByRole("menuitem", { name: "Pin this folder" });
    expect(homeRow(PUT_ON)).toBeNull();
    expect(homeRow(REMOVE)).toBeNull();

    fireEvent.click(pin);
    await waitFor(() => expect(pins.has("photos")).toBe(true));
    await act(async () => {});

    await openAndFind(PUT_ON);
    expect(indexOf(new RegExp(`^${PUT_ON}$`))).toBe(indexOf(/^Unpin this folder$/) + 1);
  });
});

describe("SPEC-CORE-102 I11 choosing the row", () => {
  it("SPEC-CORE-102 I11 Put on Home closes the menu, sends the pin's path, and flips the row", async () => {
    pins.set("Projects/Alpha & Beta", false);
    await renderFolder("Projects/Alpha & Beta");

    fireEvent.click(await openAndFind(PUT_ON));

    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ drive: DRIVE, body: { kind: "pin", id: "Projects/Alpha & Beta", on_home: true } });
    await act(async () => {});

    await openAndFind(REMOVE);
    expect(homeRow(PUT_ON)).toBeNull();
  });

  it("SPEC-CORE-102 I11 Remove from Home sends on_home false and flips the row back", async () => {
    pins.set("recipes", true);
    await renderFolder("recipes");

    fireEvent.click(await openAndFind(REMOVE));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ kind: "pin", id: "recipes", on_home: false });
    await act(async () => {});

    await openAndFind(PUT_ON);
  });

  it("SPEC-CORE-102 I11 a second choice while the PUT is in flight keeps the label and sends nothing", async () => {
    pins.set("recipes", false);
    putAnswer = "pending";
    await renderFolder("recipes");

    fireEvent.click(await openAndFind(PUT_ON));
    await waitFor(() => expect(puts).toHaveLength(1));

    fireEvent.click(await openAndFind(PUT_ON));
    await act(async () => {});
    expect(puts).toHaveLength(1);

    await act(async () => releasePut!());
    await act(async () => {});
    await openAndFind(REMOVE);
    expect(puts).toHaveLength(1);
  });

  it("SPEC-CORE-102 unpinning a folder on Home takes its Home row away, and pinning again starts off Home", async () => {
    pins.set("recipes", true);
    await renderFolder("recipes");
    await openAndFind(REMOVE);

    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin this folder" }));
    await waitFor(() => expect(pins.has("recipes")).toBe(false));
    await act(async () => {});

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pin this folder" }));
    expect(homeRow(PUT_ON)).toBeNull();
    expect(homeRow(REMOVE)).toBeNull();
    await waitFor(() => expect(pins.has("recipes")).toBe(true));
    await act(async () => {});

    await openAndFind(PUT_ON);
  });
});

describe("SPEC-CORE-102 I12 a failed PUT on the folder page", () => {
  it.each([
    ["a 5xx", "fail" as const],
    ["a 404 for a pin removed elsewhere", "missing" as const],
  ])("SPEC-CORE-102 I12 on %s keeps the row and shows drive.homeShortcutFailed, without retrying", async (_, answer) => {
    pins.set("recipes", false);
    putAnswer = answer;
    await renderFolder("recipes");

    fireEvent.click(await openAndFind(PUT_ON));

    await waitFor(() => expect(toast.error.mock.calls.map((c) => c[0])).toContain(FAILED));
    expect(puts).toHaveLength(1);
    await act(async () => {});
    await openAndFind(PUT_ON);
    expect(homeRow(REMOVE)).toBeNull();
    expect(puts).toHaveLength(1);
  });

  it("SPEC-CORE-102 I12 a failed Remove from Home keeps Remove from Home", async () => {
    pins.set("recipes", true);
    putAnswer = "fail";
    await renderFolder("recipes");

    fireEvent.click(await openAndFind(REMOVE));

    await waitFor(() => expect(toast.error.mock.calls.map((c) => c[0])).toContain(FAILED));
    await act(async () => {});
    await openAndFind(REMOVE);
  });
});
