/**
 * SPEC-CORE-102 on the search page: the Home row among a saved Smart Folder's
 * rows in the `…` menu. `useSmartFolders` runs for real; the list and the PUT
 * are answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { House, HousePlus } from "lucide-react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { SmartFolderController, SmartFolderMenuItems } from "../SmartFolderSaveButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const DRIVE = "家族 & co";
const SF_ID = "sf0000000001";
const FAILED = "Couldn't change the Home entry";
const PUT_ON = "Put on Home";
const REMOVE = "Remove from Home";

let onHome = false;
let putAnswer: "ok" | "fail" | "missing" | "pending" = "ok";
let releasePut: (() => void) | null = null;
const puts: { drive: string; body: { kind: string; id: string; on_home: boolean } }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const folder = () => ({
  id: SF_ID,
  drive: DRIVE,
  name: "Lectures",
  query: "lecture",
  file_type: "video",
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
  on_home: onHome,
});

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, "http://x").pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  if (/^\/api\/drives\/[^/]+\/smart-folders$/.test(path) && method === "GET") return json([folder()]);
  const shortcuts = /^\/api\/drives\/([^/]+)\/home-shortcuts$/.exec(path);
  if (shortcuts && method === "PUT") {
    const body = JSON.parse(String(init!.body));
    puts.push({ drive: decodeURIComponent(shortcuts[1]), body });
    if (putAnswer === "fail") return json({ detail: "boom" }, 500);
    if (putAnswer === "missing") return json({ detail: "Not Found" }, 404);
    if (putAnswer === "pending") {
      return new Promise<Response>((resolve) => {
        releasePut = () => {
          onHome = body.on_home;
          resolve(new Response(null, { status: 204 }));
        };
      });
    }
    onHome = body.on_home;
    return new Response(null, { status: 204 });
  }
  return json({ detail: "Not Found" }, 404);
});

const closeMenu = vi.fn();

async function renderMenu(smartFolderId: string | null = SF_ID) {
  render(
    <SmartFolderController drive={DRIVE} query="lecture" typeFilter="video" smartFolderId={smartFolderId}>
      <div role="menu">
        <SmartFolderMenuItems closeMenu={closeMenu} />
      </div>
    </SmartFolderController>,
  );
  if (smartFolderId) await screen.findByRole("menuitem", { name: "Update" });
  await act(async () => {});
}

const labels = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
const row = (label: string) => screen.queryByRole("menuitem", { name: label });
const errors = () => toast.error.mock.calls.map((c) => c[0]);


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
  onHome = false;
  putAnswer = "ok";
  releasePut = null;
  puts.length = 0;
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-102 I11 the Home row on a saved Smart Folder", () => {
  it.each([
    ["off Home", false, PUT_ON, REMOVE],
    ["on Home", true, REMOVE, PUT_ON],
  ])("SPEC-CORE-102 I11 while %s offers the right row, after Rename and before Delete", async (_, state, shown, hidden) => {
    onHome = state;
    await renderMenu();

    expect(await screen.findByRole("menuitem", { name: shown })).toBeInTheDocument();
    expect(row(hidden)).toBeNull();
    expectRowIcon(shown);
    const all = labels();
    expect(all.indexOf(shown)).toBe(all.indexOf("Rename") + 1);
    expect(all.indexOf("Delete")).toBe(all.indexOf(shown) + 1);
  });

  it("SPEC-CORE-102 I11 offers no Home row while no saved Smart Folder is current, and one once it is", async () => {
    const tree = (id: string | null) => (
      <SmartFolderController drive={DRIVE} query="lecture" typeFilter="video" smartFolderId={id}>
        <div role="menu">
          <SmartFolderMenuItems closeMenu={closeMenu} />
        </div>
      </SmartFolderController>
    );
    const view = render(tree(null));
    expect(await screen.findByRole("menuitem", { name: "Save as Smart Folder" })).toBeInTheDocument();
    await act(async () => {});
    expect(row(PUT_ON)).toBeNull();
    expect(row(REMOVE)).toBeNull();

    view.rerender(tree(SF_ID));

    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it("SPEC-CORE-102 I11 Put on Home closes the menu, sends the Smart Folder's id, and flips the row", async () => {
    await renderMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));

    expect(closeMenu).toHaveBeenCalled();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ drive: DRIVE, body: { kind: "smart_folder", id: SF_ID, on_home: true } });
    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
    expect(row(PUT_ON)).toBeNull();
  });

  it("SPEC-CORE-102 I11 Remove from Home sends on_home false and flips the row back", async () => {
    onHome = true;
    await renderMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: REMOVE }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ kind: "smart_folder", id: SF_ID, on_home: false });
    expect(await screen.findByRole("menuitem", { name: PUT_ON })).toBeInTheDocument();
  });

  it("SPEC-CORE-102 I11 a second choice while the PUT is in flight keeps the label and sends nothing", async () => {
    putAnswer = "pending";
    await renderMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await act(async () => {});

    fireEvent.click(screen.getByRole("menuitem", { name: PUT_ON }));
    await act(async () => {});
    expect(puts).toHaveLength(1);

    await act(async () => releasePut!());
    expect(await screen.findByRole("menuitem", { name: REMOVE })).toBeInTheDocument();
    expect(puts).toHaveLength(1);
  });
});

describe("SPEC-CORE-102 I12 a failed PUT on the search page", () => {
  it.each([
    ["a 5xx", "fail" as const],
    ["a 404 for a Smart Folder deleted elsewhere", "missing" as const],
  ])("SPEC-CORE-102 I12 on %s keeps the row and shows drive.homeShortcutFailed, without retrying", async (_, answer) => {
    putAnswer = answer;
    await renderMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: PUT_ON }));

    await waitFor(() => expect(errors()).toContain(FAILED));
    await act(async () => {});
    expect(row(PUT_ON)).toBeInTheDocument();
    expect(row(REMOVE)).toBeNull();
    expect(puts).toHaveLength(1);
  });

  it("SPEC-CORE-102 I12 a failed Remove from Home keeps Remove from Home", async () => {
    onHome = true;
    putAnswer = "fail";
    await renderMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: REMOVE }));

    await waitFor(() => expect(errors()).toContain(FAILED));
    await act(async () => {});
    expect(row(REMOVE)).toBeInTheDocument();
  });
});
