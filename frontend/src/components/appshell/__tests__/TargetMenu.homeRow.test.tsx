/**
 * SPEC-CORE-154 I8: the Put on Home / Remove from Home row of the Target menu.
 * The shortcuts GET and the PUT are answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { House } from "lucide-react";

import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import messages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";
import { TargetMenu } from "../TargetMenu";

const DRIVE = "家族 & co";
const PUT_ON = "Put on Home";
const REMOVE = "Remove from Home";
const FAILED = "Couldn't change the Home entry";

const getDriveFiles = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function folder(id: string, name: string): SmartFolder {
  return {
    id,
    drive: DRIVE,
    name,
    query: "tag:x",
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function collection(id: string, name: string): CollectionSummary {
  return {
    id,
    name,
    description: null,
    drive: DRIVE,
    item_count: 4,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const FOLDERS = [folder("sf-a", "Alpha"), folder("sf-b", "Beta")];
const COLLECTIONS = [collection("c1", "Trip")];

// ---- the wire ---------------------------------------------------------------

interface Item {
  kind: string;
  id: string;
  app: string | null;
  name: string;
  query: null;
  file_type: null;
}

type GetAnswer = Item[] | "fail" | "network" | "pending";
type PutAnswer = "ok" | "fail" | "missing" | "unprocessable" | "network" | "pending";

let listed: Item[] = [];
let getAnswer: () => GetAnswer = () => listed;
let putAnswer: PutAnswer = "ok";
const heldGets: ((items: Item[]) => void)[] = [];
const heldPuts: (() => void)[] = [];
const gets: string[] = [];
const puts: { drive: string; body: Record<string, unknown> }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const appItem = (app: string, id: string): Item => ({ kind: "app_target", id, app, name: id, query: null, file_type: null });

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, "http://x").pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  const m = /^\/api\/drives\/([^/]+)\/home-shortcuts$/.exec(path);
  if (!m) return json({ detail: "Not Found" }, 404);
  const drive = decodeURIComponent(m[1]);
  if (method === "GET") {
    gets.push(drive);
    const answer = getAnswer();
    if (answer === "fail") return json({ detail: "boom" }, 500);
    if (answer === "network") throw new TypeError("Failed to fetch");
    if (answer === "pending") return new Promise<Response>((resolve) => heldGets.push((items) => resolve(json(items))));
    return json(answer);
  }
  const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
  puts.push({ drive, body });
  const apply = () => {
    const key = (i: Item) => `${i.kind}|${i.app}|${i.id}`;
    const item = appItem(String(body.app), String(body.id));
    listed = listed.filter((i) => key(i) !== key(item));
    if (body.on_home) listed = [...listed, item];
  };
  if (putAnswer === "fail") return json({ detail: "boom" }, 500);
  if (putAnswer === "missing") return json({ detail: "Not Found" }, 404);
  if (putAnswer === "unprocessable") return json({ detail: "bad" }, 422);
  if (putAnswer === "network") throw new TypeError("Failed to fetch");
  if (putAnswer === "pending") {
    return new Promise<Response>((resolve) =>
      heldPuts.push(() => {
        apply();
        resolve(new Response(null, { status: 204 }));
      }),
    );
  }
  apply();
  return new Response(null, { status: 204 });
});

// ---- the menu ---------------------------------------------------------------

type Props = React.ComponentProps<typeof TargetMenu>;
const onChoose = vi.fn();

function menu(overrides: Partial<Props> & Record<string, unknown> = {}) {
  return (
    <TargetMenu
      drive={DRIVE}
      app="video"
      name="Alpha"
      folders={{ status: "loaded", data: FOLDERS }}
      collections={{ list: { status: "loaded", data: COLLECTIONS }, retry: vi.fn() }}
      selectedId="sf-a"
      currentCount={7}
      label="Target"
      defaultLabel="All videos"
      unavailableLabel="Not available as a target"
      defaultTargetTypes={["video"]}
      isUsable={() => true}
      onChoose={onChoose}
      onRetryFolders={vi.fn()}
      {...({ homeEntry: "video" } as Record<string, unknown>)}
      {...overrides}
    />
  );
}

const trigger = () => screen.getByRole("button", { name: /Target/ });
function openMenu() {
  if (trigger().getAttribute("aria-expanded") !== "true") fireEvent.click(trigger());
}
function closeMenu() {
  if (trigger().getAttribute("aria-expanded") === "true") fireEvent.click(trigger());
}
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const homeRows = () =>
  screen.queryAllByRole("menuitem").filter((el) => [PUT_ON, REMOVE].includes(el.textContent?.trim() ?? ""));
const manage = () => screen.getByRole("menuitem", { name: /Manage/ });
const errors = () => toast.error.mock.calls.map((c) => c[0]);

const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");
function iconClass(Icon: typeof House): string[] {
  const { container, unmount } = render(<Icon />);
  const classes = iconOf(container);
  unmount();
  return classes;
}

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listed = [];
  getAnswer = () => listed;
  putAnswer = "ok";
  heldGets.length = 0;
  heldPuts.length = 0;
  gets.length = 0;
  puts.length = 0;
  getDriveFiles.mockResolvedValue({ data: [], meta: { total: 12, page: 1, limit: 1 } });
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-154 I8 which row the menu shows", () => {
  it("SPEC-CORE-154 I8 shows Put on Home after the Targets and right before Manage… when the GET lists no app shortcut for it", async () => {
    render(menu());
    openMenu();

    const row = await screen.findByRole("menuitem", { name: PUT_ON });
    expect(homeRows()).toHaveLength(1);
    const items = screen.getAllByRole("menuitem");
    expect(items[items.indexOf(manage()) - 1]).toBe(row);
    for (const radio of screen.getAllByRole("menuitemradio")) expect(follows(radio, row)).toBe(true);
    const separators = screen.queryAllByRole("separator");
    if (separators.length > 0) expect(follows(separators.at(-1)!, row)).toBe(true);
    expect(gets.length).toBeGreaterThan(0);
    expect(gets.every((d) => d === DRIVE)).toBe(true);
  });

  it("SPEC-CORE-154 I8 shows Remove from Home when the GET lists this entry and this Target", async () => {
    listed = [appItem("video", "sf-a")];
    render(menu());
    openMenu();

    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
    expect(homeRows()).toHaveLength(1);
  });

  it.each([
    ["another app's shortcut on the same Target", [appItem("reading", "sf-a")]],
    ["this app's shortcut on another Target", [appItem("video", "sf-b")]],
    ["the Target's own Smart Collection shortcut", [{ kind: "smart_folder", id: "sf-a", app: null, name: "Alpha", query: null, file_type: null } as Item]],
  ])("SPEC-CORE-154 I8 shows Put on Home when the GET lists only %s", async (_, items) => {
    listed = items as Item[];
    render(menu());
    openMenu();

    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
    expect(homeRows()).toHaveLength(1);
  });

  it("SPEC-CORE-154 I8 compares a collection Target with its collection: prefix", async () => {
    listed = [appItem("video", "collection:c1")];
    render(menu({ selectedId: "collection:c1", name: "Trip" }));
    openMenu();

    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
  });

  it("SPEC-CORE-154 I8 compares the entry key as given, an addon entrance included", async () => {
    listed = [appItem("knowledge", "sf-a")];
    render(menu({ app: { addon: "knowledge" }, homeEntry: "knowledge/clips" }));
    openMenu();

    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it("SPEC-CORE-154 I8 draws both rows with the lucide House icon", async () => {
    render(menu());
    openMenu();
    const put = await screen.findByRole("menuitem", { name: PUT_ON });
    const expected = iconClass(House);
    expect(expected).toHaveLength(1);
    expect(iconOf(put)).toEqual(expected);

    fireEvent.click(put);
    await waitFor(() => expect(puts).toHaveLength(1));
    openMenu();
    expect(iconOf(await screen.findByRole("menuitem", { name: REMOVE }))).toEqual(expected);
  });
});

describe("SPEC-CORE-154 I8 when the row is not drawn", () => {
  it("SPEC-CORE-154 I8 draws no row for the default Target, and draws it once a Target is in force", async () => {
    const view = render(menu({ selectedId: "default", name: "All videos" }));
    openMenu();
    await settle();
    expect(manage()).toBeInTheDocument();
    expect(homeRows()).toEqual([]);
    closeMenu();

    view.rerender(menu());
    openMenu();
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it("SPEC-CORE-154 I8 draws no row without homeEntry, and draws it with one", async () => {
    const view = render(menu({ homeEntry: undefined }));
    openMenu();
    await settle();
    expect(manage()).toBeInTheDocument();
    expect(homeRows()).toEqual([]);
    closeMenu();

    view.rerender(menu());
    openMenu();
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it("SPEC-CORE-154 I8 draws no row before the GET answers", async () => {
    getAnswer = () => "pending";
    render(menu());
    openMenu();
    await waitFor(() => expect(heldGets.length).toBeGreaterThan(0));
    expect(manage()).toBeInTheDocument();
    expect(homeRows()).toEqual([]);

    await act(async () => heldGets.forEach((release) => release([])));
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it.each([
    ["a 5xx", "fail" as const],
    ["a network error", "network" as const],
  ])("SPEC-CORE-154 I8 after %s on the GET draws no row and leaves the rest, and the next open asks again", async (_, how) => {
    getAnswer = () => how;
    render(menu());
    openMenu();
    await waitFor(() => expect(gets.length).toBeGreaterThan(0));
    await settle();

    expect(homeRows()).toEqual([]);
    expect(manage()).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();

    closeMenu();
    const asked = gets.length;
    getAnswer = () => listed;
    openMenu();
    await waitFor(() => expect(gets.length).toBeGreaterThan(asked));
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-154 choosing the row", () => {
  it("SPEC-CORE-154 Put on Home sends the app_target PUT and closes the menu", async () => {
    render(menu());
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ drive: DRIVE, body: { kind: "app_target", app: "video", id: "sf-a", on_home: true } });
    expect(screen.queryByRole("menuitem", { name: /Manage/ })).toBeNull();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-154 Remove from Home sends on_home false for a collection Target", async () => {
    listed = [appItem("reading", "collection:c1")];
    render(menu({ app: "reading", homeEntry: "reading", selectedId: "collection:c1", name: "Trip" }));
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: REMOVE }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ kind: "app_target", app: "reading", id: "collection:c1", on_home: false });
  });

  it("SPEC-CORE-154 the next open after a Put shows Remove from Home", async () => {
    render(menu());
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));
    await waitFor(() => expect(puts).toHaveLength(1));

    openMenu();
    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
  });

  it("SPEC-CORE-154 I8 draws no row while the PUT is in flight", async () => {
    putAnswer = "pending";
    render(menu());
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));
    await waitFor(() => expect(heldPuts).toHaveLength(1));

    openMenu();
    await settle();
    expect(manage()).toBeInTheDocument();
    expect(homeRows()).toEqual([]);

    await act(async () => heldPuts[0]());
    closeMenu();
    openMenu();
    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
  });

  it.each([
    ["a 5xx", "fail" as const],
    ["a 404", "missing" as const],
    ["a 422", "unprocessable" as const],
    ["a network error", "network" as const],
  ])("SPEC-CORE-154 I8 a PUT that fails with %s toasts drive.homeShortcutFailed and changes no Target", async (_, how) => {
    putAnswer = how;
    localStorage.setItem(`litloft.videoApp.target.${encodeURIComponent(DRIVE)}`, "sf-a");
    const stored = { ...localStorage };
    render(menu());
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));

    await waitFor(() => expect(errors()).toEqual([FAILED]));
    expect(puts).toHaveLength(1);
    expect(onChoose).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(stored);

    openMenu();
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-154 the row's messages", () => {
  it.each([
    ["en", messages, "Put on Home", "Remove from Home"],
    ["ja", jaMessages, "ホームに置く", "ホームから外す"],
  ])("SPEC-CORE-154 appShell.putOnHome / removeFromHome read as the spec says in %s", (_, m, put, remove) => {
    const appShell = (m as unknown as { appShell: Record<string, string> }).appShell;
    expect(appShell.putOnHome).toBe(put);
    expect(appShell.removeFromHome).toBe(remove);
  });
});
