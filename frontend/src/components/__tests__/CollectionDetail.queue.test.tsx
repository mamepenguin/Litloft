/**
 * SPEC-CORE-190: a collection's page with a file open plays the collection as
 * a queue in its left pane. Mounted at the route component with the real
 * selection hook, pane and right pane; only the file view is a stand-in, so
 * what an ended file does and whether it was asked to start can be read from
 * the props it is handed and from the walk the page row publishes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installWireFetch, json, type WireCall } from "@/__tests__/helpers/wireFetch";
import { _resetFileSeedForTests } from "@/lib/fileSeed";
import { treeEnabledStore } from "@/lib/treeEnabledStore";
import type { FileItem } from "@/types";

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    pathname: "/drive/main/collections/c1",
    params: new URLSearchParams(),
  };
  const go = (target: string) => {
    const url = new URL(target, "http://localhost");
    state.pathname = url.pathname;
    state.params = new URLSearchParams(url.search);
    for (const l of listeners) l();
  };
  return {
    state,
    listeners,
    history: [] as string[],
    router: {
      push: (target: string) => {
        nav.history.push(target);
        go(target);
      },
      replace: (target: string) => {
        nav.history.push(target);
        go(target);
      },
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => nav.router,
    usePathname: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.pathname),
    useSearchParams: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.params),
    useParams: () => ({ name: "main", id: "c1" }),
  };
});

const { toastErrorSpy } = vi.hoisted(() => ({ toastErrorSpy: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ error: toastErrorSpy, success: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
  useCurrentDrive: () => "main",
}));

vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => <div data-testid="tree-pane" />,
}));
vi.mock("@/components/SidebarProvider", async (orig) => ({
  ...(await orig<object>()),
  useOverlaySidebarWhen: () => {},
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), clear: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-grid" data-ids={files.map((f) => f.id).join(",")} />
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-list" data-ids={files.map((f) => f.id).join(",")} />
  ),
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("@/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null, SlotEntryRenderer: () => null }));

const view = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  mounts: 0,
}));
vi.mock("@/components/FileDetailContent", async () => {
  const React = await import("react");
  const { useFileNavState } = await import("@/lib/fileNavContext");
  return {
    FileDetailContent: (props: Record<string, unknown>) => {
      view.props.push(props);
      React.useEffect(() => {
        view.mounts += 1;
      }, []);
      const walk = useFileNavState();
      return (
        <div data-testid="file-view" data-file={String(props.fileId)}>
          {walk && (
            <span
              data-testid="walk"
              data-prev={walk.prevId ?? ""}
              data-next={walk.nextId ?? ""}
              data-position={walk.position ?? ""}
              data-total={walk.total ?? ""}
            />
          )}
        </div>
      );
    },
  };
});

import { AppShell } from "@/components/AppShell";
import { appHeader, installMatchMedia, setWidth } from "@/components/FileDetail/__tests__/headerRowHarness";
import { CollectionDetail } from "../CollectionDetail";
import { CollectionPicker } from "../CollectionPicker";

Element.prototype.scrollIntoView = vi.fn();

function installWide() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

function makeFile(id: string, type: FileItem["file_type"], extra: Partial<FileItem> = {}): FileItem {
  const mime =
    type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : type === "image" ? "image/png" : "text/plain";
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.dat`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "elsewhere",
    file_type: type,
    mime_type: mime,
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: type === "video" || type === "audio" ? 60 : null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
    modified_at: null,
    ...extra,
  };
}

// d1 document, v2 video, a3 audio (missing), v4 video, i5 image.
const FILES: FileItem[] = [
  makeFile("d1", "document"),
  makeFile("v2", "video"),
  makeFile("a3", "audio", { missing_since: "2026-01-01T00:00:00Z" }),
  makeFile("v4", "video"),
  makeFile("i5", "image"),
];
const OUTSIDE = makeFile("zz", "video");

const server = vi.hoisted(() => ({
  items: [] as Array<{ id: number; position: number; file: unknown }>,
  failWrites: false,
  collectionReads: 0,
}));

function resetServer() {
  server.items = FILES.map((file, i) => ({ id: i + 1, position: i, file }));
  server.failWrites = false;
  server.collectionReads = 0;
}

function collectionBody() {
  return {
    id: "c1",
    name: "Road Trip",
    description: null,
    drive: "main",
    items: server.items.map((it, i) => ({ ...it, position: i })),
    created_at: "",
    updated_at: "",
  };
}

function answer(call: WireCall): Response {
  const path = call.url.pathname;
  if (path === "/api/drives/main/collections/c1" && call.method === "GET") {
    server.collectionReads += 1;
    return json(collectionBody());
  }
  if (path === "/api/drives/main/collections/c1/items/reorder" && call.method === "PUT") {
    if (server.failWrites) return json({ detail: "boom" }, 500);
    const ids = (call.body as { item_ids: number[] }).item_ids;
    server.items = ids.map((id) => server.items.find((it) => it.id === id)!);
    return json(collectionBody());
  }
  if (path === "/api/drives/main/collections" && call.method === "GET") {
    return json([
      { id: "c1", name: "Road Trip", description: null, drive: "main", item_count: server.items.length, first_file_id: null, created_at: "", updated_at: "" },
    ]);
  }
  if (path === "/api/drives/main/collections/c1/items" && call.method === "POST") {
    const ids = (call.body as { file_ids: string[] }).file_ids;
    const nextId = Math.max(...server.items.map((it) => it.id)) + 1;
    server.items = [
      ...server.items,
      ...ids.map((fid, i) => ({ id: nextId + i, position: server.items.length + i, file: [...FILES, OUTSIDE].find((f) => f.id === fid)! })),
    ];
    return json(collectionBody());
  }
  const removal = path.match(/^\/api\/drives\/main\/collections\/c1\/items\/(\d+)$/);
  if (removal && call.method === "DELETE") {
    if (server.failWrites) return json({ detail: "boom" }, 500);
    server.items = server.items.filter((it) => it.id !== Number(removal[1]));
    return new Response(null, { status: 204 });
  }
  const neighbors = path.match(/^\/api\/files\/([^/]+)\/neighbors$/);
  if (neighbors) {
    return json({ prev_id: "folder-prev", next_id: "folder-next", position: 7, total: 9 });
  }
  const file = path.match(/^\/api\/files\/([^/]+)$/);
  if (file) {
    const found = [...FILES, OUTSIDE].find((f) => f.id === file[1]);
    return found ? json(found) : json({ detail: "not found" }, 404);
  }
  if (path === "/api/drives/main/summary") return json({ name: "main", trash_count: 0, missing_count: 0 });
  if (path === "/api/auth/status") return json({ unlocked_groups: [], has_protected_drives: false, is_admin: false });
  return json(call.method === "GET" ? [] : {});
}


function openAt(query: string) {
  nav.state.pathname = "/drive/main/collections/c1";
  nav.state.params = new URLSearchParams(query);
  nav.history.length = 0;
  return render(<CollectionDetail drive="main" collectionId="c1" />);
}

/** The left pane: the `aside` that holds the collection's rows. */
function pane(): HTMLElement {
  const aside = screen
    .getAllByText("File d1")
    .map((el) => el.closest("aside"))
    .find((el): el is HTMLElement => el !== null);
  if (!aside) throw new Error("no left pane holds the collection's rows");
  return aside;
}
const currentFile = () => nav.state.params.get("file");
const lastViewProps = () => view.props[view.props.length - 1];
const lastPropsFor = (id: string) => [...view.props].reverse().find((p) => p.fileId === id);

function rowOf(id: string): HTMLElement {
  const row = within(pane())
    .getAllByText(`File ${id}`)
    .map((el) => el.closest("li"))
    .find((li): li is HTMLLIElement => li !== null);
  if (!row) throw new Error(`no queue row for ${id}`);
  return row;
}

/**
 * A control that should return to the collection's list on this page. An
 * anchor is judged by its href, since a click on one does not reach the
 * router stand-in; a button is pressed.
 */
async function expectBackToList(control: HTMLElement) {
  if (control.tagName === "A") {
    const url = new URL(control.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/drive/main/collections/c1");
    expect(url.searchParams.has("file")).toBe(false);
    return;
  }
  fireEvent.click(control);
  await waitFor(() => expect(currentFile()).toBeNull());
  expect(nav.state.pathname).toBe("/drive/main/collections/c1");
}

async function fileOpen(id: string) {
  await waitFor(() => expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", id));
}

async function walkReady() {
  await waitFor(() => expect(screen.getByTestId("walk")).toBeInTheDocument());
  return screen.getByTestId("walk");
}

async function end() {
  const onEnded = lastViewProps().onEnded as (() => void) | undefined;
  expect(typeof onEnded).toBe("function");
  await act(async () => {
    onEnded!();
  });
}

/** The loop button is named for the action it takes, and `aria-pressed` holds the state. */
/** The text of the element that shows the position, `n / N`, `– / N` or `– / –`. */
function positionIn(root: HTMLElement): string | null {
  const hit = [...root.querySelectorAll("*")].find((el) =>
    /^(\d+|–) \/ (\d+|–)$/.test((el.textContent ?? "").trim()),
  );
  return hit ? (hit.textContent ?? "").trim() : null;
}

async function loopButton(): Promise<HTMLElement> {
  return within(pane()).findByRole("button", { name: /^Loop (ON|OFF)$/ });
}

async function expectLoop(on: boolean) {
  const button = await loopButton();
  expect(button).toHaveAttribute("aria-pressed", String(on));
  expect(button).toHaveAccessibleName(on ? "Loop OFF" : "Loop ON");
}

async function setLoop(on: boolean) {
  const button = await loopButton();
  if (button.getAttribute("aria-pressed") !== String(on)) fireEvent.click(button);
  await waitFor(() => expect(within(pane()).getByRole("button", { name: /^Loop (ON|OFF)$/ })).toHaveAttribute("aria-pressed", String(on)));
  await expectLoop(on);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  installWide();
  treeEnabledStore.reset();
  treeEnabledStore.set("main", true);
  _resetFileSeedForTests();
  resetServer();
  view.props.length = 0;
  view.mounts = 0;
  toastErrorSpy.mockClear();
  installWireFetch(answer);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  treeEnabledStore.reset();
});

describe("SPEC-CORE-190 step 2 / I16 / I11 Play selects the first playable item on the same page and starts it", () => {
  it("opens v2 (skipping the document) with ?file= and asks it to start", async () => {
    openAt("");
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    await fileOpen("v2");
    expect(nav.state.pathname).toBe("/drive/main/collections/c1");
    expect(currentFile()).toBe("v2");
    expect(nav.history.some((t) => t.startsWith("/files/"))).toBe(false);
    expect(lastPropsFor("v2")?.autoPlay).toBe(true);
    expect([...nav.state.params.keys()].sort()).toEqual(["file"]);
  });
});

describe("SPEC-CORE-190 step 5 / I11 how the file was reached decides whether it starts", () => {
  it("SPEC-CORE-190 I11 a row choice starts the file with the Autoplay preference off", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    fireEvent.click(within(rowOf("v4")).getByText("File v4"));
    await fileOpen("v4");
    expect(lastPropsFor("v4")?.autoPlay).toBe(true);
    expect([...nav.state.params.keys()].sort()).toEqual(["file"]);
  });

  it("SPEC-CORE-190 I11 a link or reload does not start the file while the preference is off, and a row choice then does", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    expect(lastPropsFor("v2")?.autoPlay).not.toBe(true);
    fireEvent.click(within(rowOf("v4")).getByText("File v4"));
    await fileOpen("v4");
    expect(lastPropsFor("v4")?.autoPlay).toBe(true);
  });
});

describe("SPEC-CORE-190 step 6 / I2 an ended file advances to the next playable item", () => {
  it("skips the missing audio and opens v4, which starts", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    await walkReady();
    await end();
    await fileOpen("v4");
    expect(currentFile()).toBe("v4");
    expect(lastPropsFor("v4")?.autoPlay).toBe(true);
  });

  it("with loop off, the default, stays on the last playable item", async () => {
    openAt("file=v4");
    await fileOpen("v4");
    await expectLoop(false);
    await walkReady();
    await end();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(currentFile()).toBe("v4");
    expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", "v4");
  });

  it("with loop on, wraps past the document at the start to v2", async () => {
    openAt("file=v4");
    await fileOpen("v4");
    await setLoop(true);
    await walkReady();
    await end();
    await fileOpen("v2");
    expect(lastPropsFor("v2")?.autoPlay).toBe(true);
  });

  it("skips a trashed audio item", async () => {
    server.items = [
      { id: 1, position: 0, file: makeFile("v2", "video") },
      { id: 2, position: 1, file: makeFile("t3", "audio", { deleted_at: "2026-01-01T00:00:00Z" }) },
      { id: 3, position: 2, file: makeFile("v4", "video") },
    ];
    openAt("file=v2");
    await fileOpen("v2");
    await walkReady();
    await end();
    await fileOpen("v4");
  });
});

describe("SPEC-CORE-190 step 7 / I3 previous and next walk the collection, not the folder", () => {
  it("on v4: previous is the missing audio a3, next is the image i5, at 4 / 5", async () => {
    openAt("file=v4");
    await fileOpen("v4");
    const walk = await walkReady();
    await waitFor(() => expect(walk).toHaveAttribute("data-next", "i5"));
    expect(walk).toHaveAttribute("data-prev", "a3");
    expect(walk).toHaveAttribute("data-position", "4");
    expect(walk).toHaveAttribute("data-total", "5");
    expect(positionIn(pane())).toBe("4 / 5");
  });

  it("is disabled before the first item and after the last, with loop on", async () => {
    openAt("file=d1");
    await fileOpen("d1");
    await setLoop(true);
    const first = await walkReady();
    await waitFor(() => expect(first).toHaveAttribute("data-next", "v2"));
    expect(first).toHaveAttribute("data-prev", "");
    cleanup();

    openAt("file=i5");
    await fileOpen("i5");
    const last = await walkReady();
    await waitFor(() => expect(last).toHaveAttribute("data-prev", "v4"));
    expect(last).toHaveAttribute("data-next", "");
  });
});

describe("SPEC-CORE-190 §2 / I10 a file the collection does not hold", () => {
  it("shows no position, no previous or next, and does not advance", async () => {
    openAt("file=zz");
    await fileOpen("zz");
    await waitFor(() => expect(positionIn(pane())).toBe("– / 5"));
    const walk = await walkReady();
    expect(walk).toHaveAttribute("data-prev", "");
    expect(walk).toHaveAttribute("data-next", "");
    const onEnded = lastViewProps().onEnded as (() => void) | undefined;
    if (onEnded) {
      await act(async () => {
        onEnded();
      });
    }
    expect(currentFile()).toBe("zz");
    expect(nav.history).toEqual([]);
  });
});

describe("SPEC-CORE-190 step 8 / I4 reorder and remove change the queue in place", () => {
  it("moving v4 above a3 makes it v2's next, without a reload of the open file", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    const walk = await walkReady();
    await waitFor(() => expect(walk).toHaveAttribute("data-next", "a3"));
    const mountsBefore = view.mounts;
    fireEvent.click(within(rowOf("v4")).getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "v4"));
    expect(view.mounts).toBe(mountsBefore);
    expect(currentFile()).toBe("v2");
  });

  it("removing the open item leaves it open as a file outside the collection", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    await walkReady();
    fireEvent.click(within(rowOf("v2")).getByRole("button", { name: "Remove from collection" }));
    await waitFor(() => expect(positionIn(pane())).toBe("– / 4"));
    expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", "v2");
    expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "");
    expect(screen.getByTestId("walk")).toHaveAttribute("data-prev", "");
  });

  it("a failed reorder shows the toast, keeps the file mounted and reads the collection again", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    await walkReady();
    const mountsBefore = view.mounts;
    const readsBefore = server.collectionReads;
    server.failWrites = true;
    fireEvent.click(within(rowOf("v4")).getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
    await waitFor(() => expect(server.collectionReads).toBeGreaterThan(readsBefore));
    expect(view.mounts).toBe(mountsBefore);
    expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", "v2");
    expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "a3");
  });
});

describe("SPEC-CORE-190 §9 / D1 / I8 the collection's queue pane", () => {
  it("is named Queue, is the one queue pane, and every row has move up, move down and remove", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    const queue = await screen.findByLabelText("Queue", { selector: ":not(button)" });
    expect(screen.getAllByLabelText("Queue", { selector: ":not(button)" })).toHaveLength(1);
    for (const f of FILES) {
      const row = within(queue)
        .getAllByText(`File ${f.id}`)
        .map((el) => el.closest("li"))
        .find((li): li is HTMLLIElement => li !== null);
      if (!row) throw new Error(`no queue row for ${f.id}`);
      expect(within(row).getByRole("button", { name: "Move up" })).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Move down" })).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Remove from collection" })).toBeInTheDocument();
    }
  });
});

describe("SPEC-CORE-190 step 9 / I12 the current row is scrolled into view", () => {
  it("scrolls v2's row with block nearest on load, and v4's row after the advance", async () => {
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    openAt("file=v2");
    await fileOpen("v2");
    const scrolledRows = () =>
      scroll.mock.contexts
        .map((el, i) => ({ el: el as Element, options: scroll.mock.calls[i][0] }))
        .filter(({ options }) => (options as ScrollIntoViewOptions | undefined)?.block === "nearest")
        .map(({ el }) => el.closest("li")?.textContent ?? "");
    await waitFor(() => expect(scrolledRows().some((t) => t.includes("File v2"))).toBe(true));
    await end();
    await fileOpen("v4");
    await waitFor(() => expect(scrolledRows().at(-1)).toContain("File v4"));
  });
});

describe("SPEC-CORE-190 step 10 / I12 the collection name in the pane goes back to the list", () => {
  it("clears ?file= and stays on the collection page", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    const name = (await within(pane()).findAllByText("Road Trip"))
      .map((el) => el.closest("a, button"))
      .find((el): el is HTMLElement => el !== null);
    if (!name) throw new Error("the pane's collection name is not a control");
    await expectBackToList(name);
  });
});

describe("SPEC-CORE-190 I14 loop is read from and written to collection-loop only by the loop button", () => {
  it("starts off, writes nothing on an advance, and writes collection-loop when the button turns it on and off", async () => {
    openAt("file=v2");
    await fileOpen("v2");
    await expectLoop(false);
    await walkReady();
    await end();
    await fileOpen("v4");
    expect(localStorage.getItem("collection-loop")).toBeNull();
    await setLoop(true);
    const onValue = localStorage.getItem("collection-loop");
    expect(onValue).not.toBeNull();
    await setLoop(false);
    expect(localStorage.getItem("collection-loop")).not.toBe(onValue);
  });
});

describe("SPEC-CORE-190 step 11 / I14 an add through Add to collection reaches the open queue", () => {
  it("after adding zz to this collection, v4's queue counts six items and the file stays mounted", async () => {
    nav.state.pathname = "/drive/main/collections/c1";
    nav.state.params = new URLSearchParams("file=v4");
    render(
      <>
        <CollectionDetail drive="main" collectionId="c1" />
        <div data-testid="picker">
          <CollectionPicker open drive="main" fileIds={["zz"]} onClose={() => {}} />
        </div>
      </>,
    );
    await fileOpen("v4");
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-total", "5"));
    const mounts = view.mounts;
    fireEvent.click(await within(screen.getByTestId("picker")).findByText("Road Trip"));
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-total", "6"));
    expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "i5");
    expect(view.mounts).toBe(mounts);
    expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", "v4");
  });
});

describe("SPEC-CORE-190 D2 / I12 / SPEC-CORE-094 I5 the trail on a collection page", () => {
  it("reads drive / collection / file title, and the collection crumb clears ?file= on the same page", async () => {
    installMatchMedia();
    setWidth(1440);
    nav.state.pathname = "/drive/main/collections/c1";
    nav.state.params = new URLSearchParams("file=v2");
    render(
      <AppShell>
        <CollectionDetail drive="main" collectionId="c1" />
      </AppShell>,
    );
    await fileOpen("v2");
    await waitFor(() => expect(within(appHeader()).getAllByText("Road Trip").length).toBeGreaterThan(0));
    const text = appHeader().textContent ?? "";
    expect(text.indexOf("main")).toBeLessThan(text.indexOf("Road Trip"));
    expect(text.indexOf("Road Trip")).toBeLessThan(text.lastIndexOf("File v2"));
    const crumb = within(appHeader())
      .getAllByText("Road Trip")
      .map((el) => el.closest("a, button"))
      .find((el): el is HTMLElement => el !== null);
    if (!crumb) throw new Error("the collection crumb is not a control");
    await expectBackToList(crumb);
  });
});

