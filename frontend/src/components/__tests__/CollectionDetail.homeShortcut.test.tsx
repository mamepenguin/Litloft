/**
 * SPEC-CORE-102 on the collection page: the Home row in the collection's `…`
 * menu. The collection and the PUT are answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { House, HousePlus } from "lucide-react";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";

import { CollectionDetail } from "../CollectionDetail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
}));
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: null, selectFile: vi.fn(), clearFile: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({ children, leftPane }: { children: React.ReactNode; leftPane?: React.ReactNode }) => (
    <>
      <aside>{leftPane}</aside>
      <section>{children}</section>
    </>
  ),
}));
vi.mock("@/components/CollectionItemsPane", () => ({ CollectionItemsPane: () => <div /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => <button type="button">tree</button> }));

const DRIVE = "家族 & co";
const ID = "c1";
const NAME = "My Collection";
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

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, "http://x").pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  const detail = /^\/api\/drives\/([^/]+)\/collections\/([^/]+)$/.exec(path);
  if (detail && method === "GET") {
    return json({
      id: ID,
      name: NAME,
      description: null,
      drive: decodeURIComponent(detail[1]),
      items: [],
      created_at: "",
      updated_at: "",
      on_home: onHome,
    });
  }
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

const trigger = () => screen.findByRole("button", { name: new RegExp(`More actions for ${NAME}`) });
async function openAndFind(label: string) {
  fireEvent.click(await trigger());
  return await screen.findByRole("menuitem", { name: label });
}
const labels = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
const errors = () => toast.error.mock.calls.map((c) => c[0]);

async function renderPage() {
  render(<CollectionDetail drive={DRIVE} collectionId={ID} />);
  await trigger();
  await act(async () => {});
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
  onHome = false;
  putAnswer = "ok";
  releasePut = null;
  puts.length = 0;
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-102 I11 the Home row on a collection", () => {
  it.each([
    ["off Home", false, PUT_ON, REMOVE],
    ["on Home", true, REMOVE, PUT_ON],
  ])("SPEC-CORE-102 I11 while %s offers the right row, before Delete", async (_, state, shown, hidden) => {
    onHome = state;
    await renderPage();

    await openAndFind(shown);

    expect(screen.queryByRole("menuitem", { name: hidden })).toBeNull();
    expectRowIcon(shown);
    const del = labels().indexOf("Delete collection");
    expect(del).toBeGreaterThan(0);
    expect(labels().indexOf(shown)).toBe(del - 1);
  });

  it("SPEC-CORE-102 I11 Put on Home closes the menu, sends the collection's id, and flips the row", async () => {
    await renderPage();

    fireEvent.click(await openAndFind(PUT_ON));

    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ drive: DRIVE, body: { kind: "collection", id: ID, on_home: true } });
    await act(async () => {});

    await openAndFind(REMOVE);
  });

  it("SPEC-CORE-102 I11 Remove from Home sends on_home false and flips the row back", async () => {
    onHome = true;
    await renderPage();

    fireEvent.click(await openAndFind(REMOVE));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ kind: "collection", id: ID, on_home: false });
    await act(async () => {});
    await openAndFind(PUT_ON);
  });

  it("SPEC-CORE-102 I11 a second choice while the PUT is in flight keeps the label and sends nothing", async () => {
    putAnswer = "pending";
    await renderPage();

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
});

describe("SPEC-CORE-102 I12 a failed PUT on the collection page", () => {
  it.each([
    ["a 5xx", "fail" as const],
    ["a 404 for a collection deleted elsewhere", "missing" as const],
  ])("SPEC-CORE-102 I12 on %s keeps the row and shows drive.homeShortcutFailed, without retrying", async (_, answer) => {
    putAnswer = answer;
    await renderPage();

    fireEvent.click(await openAndFind(PUT_ON));

    await waitFor(() => expect(errors()).toContain(FAILED));
    await act(async () => {});
    await openAndFind(PUT_ON);
    expect(screen.queryByRole("menuitem", { name: REMOVE })).toBeNull();
    expect(puts).toHaveLength(1);
  });

  it("SPEC-CORE-102 I12 a failed Remove from Home keeps Remove from Home", async () => {
    onHome = true;
    putAnswer = "fail";
    await renderPage();

    fireEvent.click(await openAndFind(REMOVE));

    await waitFor(() => expect(errors()).toContain(FAILED));
    await act(async () => {});
    await openAndFind(REMOVE);
  });
});
