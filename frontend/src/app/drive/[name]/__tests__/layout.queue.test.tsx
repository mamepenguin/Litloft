/**
 * SPEC-CORE-191: `queue=folder` and `queue=smart:{id}` on a folder route put
 * the queue in the left pane in place of the folder tree. Mounted at the drive
 * layout with the real two-pane layout, selection hook and right pane; the
 * file view is a stand-in that shows what it was handed and the walk the page
 * row publishes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installWireFetch, json, type WireCall } from "@/__tests__/helpers/wireFetch";
import { smartFolderHref } from "@/lib/driveViews";
import { _resetFileSeedForTests } from "@/lib/fileSeed";
import { storeSmartQueue } from "@/lib/smartQueue";
import { treeEnabledStore } from "@/lib/treeEnabledStore";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { installMatchMedia, setWidth } from "@/components/FileDetail/__tests__/headerRowHarness";
import type { FileItem } from "@/types";

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

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { pathname: "/drive/work/Q1", params: new URLSearchParams() };
  const go = (target: string) => {
    const url = new URL(target, "http://localhost");
    state.pathname = url.pathname;
    state.params = new URLSearchParams(url.search);
    for (const l of listeners) l();
  };
  return {
    state,
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
    useParams: () => {
      const parts = nav.state.pathname.split("/").filter(Boolean);
      return parts.length > 2 ? { name: parts[1], path: parts.slice(2) } : { name: parts[1] };
    },
  };
});

// The tree stays mounted under a queue pane, so its choices go through the
// real selection hook from here.
vi.mock("@/components/folder/FolderTreePane", async () => {
  const { useSelectedFile } = await import("@/hooks/useSelectedFile");
  return {
    FolderTreePane: () => {
      const { selectFile } = useSelectedFile();
      return (
        <div data-testid="tree-pane">
          <button data-testid="tree-choose-v2" onClick={() => selectFile("v2")} />
          <button data-testid="tree-choose-zz" onClick={() => selectFile("zz")} />
        </div>
      );
    },
  };
});
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
  useOverlaySidebarWhen: () => {},
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), clear: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));

const evaluation = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/smartCollectionEval", () => ({
  evaluateSmartCollection: (...args: unknown[]) => evaluation.fn(...args),
}));

const view = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>>, mounts: 0 }));
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

import DriveLayout from "../layout";

Element.prototype.scrollIntoView = vi.fn();

function makeFile(id: string, type: FileItem["file_type"], title: string, createdAt: string): FileItem {
  const mime =
    type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : type === "image" ? "image/png" : "text/plain";
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.dat`,
    title,
    description: "",
    drive: "work",
    folder_path: "Q1",
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
    created_at: createdAt,
    updated_at: createdAt,
    modified_at: null,
  };
}

// By title ascending: Alpha (v3), Bravo (a1), Charlie (i9, image), Delta (v2).
// By created_at descending: v3, i9, v2, a1.
const Q1: FileItem[] = [
  makeFile("a1", "audio", "Bravo", "2026-01-01T00:00:00Z"),
  makeFile("v2", "video", "Delta", "2026-01-02T00:00:00Z"),
  makeFile("i9", "image", "Charlie", "2026-01-03T00:00:00Z"),
  makeFile("v3", "video", "Alpha", "2026-01-04T00:00:00Z"),
];
const OUTSIDE = makeFile("zz", "video", "Elsewhere", "2026-01-05T00:00:00Z");
const SMART_FILES = [makeFile("s1", "video", "S one", "2026-02-01T00:00:00Z"), makeFile("s2", "audio", "S two", "2026-02-02T00:00:00Z")];

const server = vi.hoisted(() => ({ listing: "ok" as "ok" | "fail" | "hang" }));

function sortFiles(files: FileItem[], sort: string, order: string): FileItem[] {
  const key = (f: FileItem): string | number =>
    sort === "title" ? f.title : sort === "file_size" ? f.file_size : f.created_at;
  const sorted = [...files].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return order === "asc" ? sorted : sorted.reverse();
}

function answer(call: WireCall): Response | Promise<Response> {
  const path = call.url.pathname;
  const q = call.url.searchParams;
  if (path === "/api/drives/work/files" && call.method === "GET") {
    if (server.listing === "fail") return json({ detail: "boom" }, 500);
    if (server.listing === "hang") return new Promise<Response>(() => {});
    const types = q.getAll("type");
    let files = Q1.filter((f) => types.length === 0 || types.includes(f.file_type));
    files = sortFiles(files, q.get("sort") ?? "created_at", q.get("order") ?? "desc");
    const page = Number(q.get("page") ?? "1");
    const limit = Number(q.get("limit") ?? "30");
    return json({ data: files.slice((page - 1) * limit, page * limit), meta: { total: files.length, page, limit } });
  }
  if (path === "/api/drives/work/smart-folders") {
    return json([
      { id: "sf-cold", drive: "work", name: "Cold Name", query: "dogs", file_type: "video", sort_by: null, sort_order: null, created_at: "2026-05-01T00:00:00Z", updated_at: null },
      { id: "sf-live", drive: "work", name: "Live Name", query: "cats", file_type: "video", sort_by: null, sort_order: null, created_at: "2026-05-01T00:00:00Z", updated_at: null },
    ]);
  }
  if (path === "/api/drives/work/summary") return json({ name: "work", trash_count: 0, missing_count: 0 });
  if (path === "/api/auth/status") return json({ unlocked_groups: [], has_protected_drives: false, is_admin: false });
  if (/^\/api\/files\/[^/]+\/neighbors$/.test(path)) {
    return json({ prev_id: "folder-prev", next_id: "folder-next", position: 7, total: 9 });
  }
  const file = path.match(/^\/api\/files\/([^/]+)$/);
  if (file) {
    const found = [...Q1, OUTSIDE, ...SMART_FILES].find((f) => f.id === file[1]);
    return found ? json(found) : json({ detail: "not found" }, 404);
  }
  return json({});
}

function openAt(pathname: string, query: string) {
  nav.state.pathname = pathname;
  nav.state.params = new URLSearchParams(query);
  nav.history.length = 0;
  return render(
    <DriveLayout>
      <div data-testid="listing">listing</div>
    </DriveLayout>,
  );
}

const findQueuePane = () => screen.findByLabelText("Queue", { selector: ":not(button)" });
const param = (k: string) => nav.state.params.get(k);
const lastViewProps = () => view.props[view.props.length - 1];
const lastPropsFor = (id: string) => [...view.props].reverse().find((p) => p.fileId === id);

function treeShown(): boolean {
  const tree = screen.queryByTestId("tree-pane");
  if (!tree) return false;
  return tree.closest("[aria-hidden='true'], [hidden], .hidden") === null;
}

/** The queue's titles of Q1, in the order the pane draws them. */
function titleOrder(pane: HTMLElement): string[] {
  const text = pane.textContent ?? "";
  return ["Alpha", "Bravo", "Charlie", "Delta"]
    .filter((t) => text.includes(t))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

/** The text of the element that shows the position, `n / N`, `– / N` or `– / –`. */
function positionIn(root: HTMLElement): string | null {
  const hit = [...root.querySelectorAll("*")].find((el) =>
    /^(\d+|–) \/ (\d+|–)$/.test((el.textContent ?? "").trim()),
  );
  return hit ? (hit.textContent ?? "").trim() : null;
}

async function fileOpen(id: string) {
  await waitFor(() => expect(screen.getByTestId("file-view")).toHaveAttribute("data-file", id));
}

async function end() {
  const onEnded = lastViewProps().onEnded as (() => void) | undefined;
  expect(typeof onEnded).toBe("function");
  await act(async () => {
    onEnded!();
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  installWide();
  _resetFileSeedForTests();
  treeEnabledStore.reset();
  treeNarrowOpenStore.reset();
  treeEnabledStore.set("work", true);
  server.listing = "ok";
  view.props.length = 0;
  view.mounts = 0;
  evaluation.fn.mockReset();
  installWireFetch(answer);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  treeEnabledStore.reset();
});

describe("SPEC-CORE-191 step 3 / I8 the queue takes the tree's place", () => {
  it("shows exactly one queue pane and does not show the tree", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    expect(await findQueuePane()).toBeInTheDocument();
    expect(screen.getAllByLabelText("Queue", { selector: ":not(button)" })).toHaveLength(1);
    expect(treeShown()).toBe(false);
  });

  it("SPEC-CORE-191 I5 shows the tree again, with nothing remounted, after the queue ends", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    await findQueuePane();
    fireEvent.click(screen.getByRole("button", { name: "Close the queue and show the folder tree" }));
    await waitFor(() => expect(treeShown()).toBe(true));
    expect(screen.queryByLabelText("Queue", { selector: ":not(button)" })).toBeNull();
  });
});

describe("SPEC-CORE-191 step 3 / I15 the folder queue holds the folder's video and audio in the URL's order", () => {
  it("orders by sort=title&order=asc: Alpha, Bravo, Delta, with the image left out", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toEqual(["Alpha", "Bravo", "Delta"]));
  });

  it("without sort and order, uses created_at desc: Alpha, Delta, Bravo", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toEqual(["Alpha", "Delta", "Bravo"]));
  });

  it("with sort=random and nothing stored for the tab, uses created_at desc", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=random");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toEqual(["Alpha", "Delta", "Bravo"]));
  });
});

describe("SPEC-CORE-191 step 4 / I3 previous and next walk the folder queue", () => {
  it("on Bravo (a1) under title asc: previous Alpha (v3), next Delta (v2), 2 / 3", async () => {
    openAt("/drive/work/Q1", "file=a1&queue=folder&sort=title&order=asc");
    await fileOpen("a1");
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "v2"));
    const walk = screen.getByTestId("walk");
    expect(walk).toHaveAttribute("data-prev", "v3");
    expect(walk).toHaveAttribute("data-position", "2");
    expect(walk).toHaveAttribute("data-total", "3");
  });
});

describe("SPEC-CORE-191 step 4-5 / I2 / I5 an advance keeps queue=, sort and order", () => {
  it("Alpha ends and Bravo opens, starting, with the queue parameters kept", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "a1"));
    await end();
    await fileOpen("a1");
    expect(param("queue")).toBe("folder");
    expect(param("sort")).toBe("title");
    expect(param("order")).toBe("asc");
    expect(lastPropsFor("a1")?.autoPlay).toBe(true);
  });

  it("a row choice keeps queue=, sort and order and starts the file", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toHaveLength(3));
    fireEvent.click(within(pane).getByText("Delta"));
    await fileOpen("v2");
    expect(param("queue")).toBe("folder");
    expect(param("sort")).toBe("title");
    expect(param("order")).toBe("asc");
    expect(lastPropsFor("v2")?.autoPlay).toBe(true);
  });
});

describe("SPEC-CORE-191 step 7 / I5 the close button ends the queue and keeps the file", () => {
  it("removes queue=, sort and order, keeps the file mounted", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    await findQueuePane();
    const mounts = view.mounts;
    fireEvent.click(screen.getByRole("button", { name: "Close the queue and show the folder tree" }));
    await waitFor(() => expect(param("queue")).toBeNull());
    expect(param("sort")).toBeNull();
    expect(param("order")).toBeNull();
    expect(param("file")).toBe("v3");
    expect(view.mounts).toBe(mounts);
  });
});

describe("SPEC-CORE-191 step 6 the name in the top block links to the folder's listing", () => {
  it("links the folder queue's name to /drive/work/Q1", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    const link = within(pane).getByRole("link", { name: /Q1/ });
    expect(new URL(link.getAttribute("href")!, "http://localhost").pathname).toBe("/drive/work/Q1");
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("queue")).toBeNull();
  });
});

describe("SPEC-CORE-191 D4 / I8 folder and Smart queue rows carry no reorder or remove buttons", () => {
  it("has no move or remove buttons in a folder queue", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toHaveLength(3));
    expect(within(pane).queryByRole("button", { name: "Move up" })).toBeNull();
    expect(within(pane).queryByRole("button", { name: "Move down" })).toBeNull();
    expect(within(pane).queryByRole("button", { name: "Remove from collection" })).toBeNull();
  });
});

describe("SPEC-CORE-191 §2 a queue that is loading", () => {
  it("draws the loading line, disables previous and next, and shows – / –", async () => {
    server.listing = "hang";
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    expect(within(pane).getByText("Loading the queue…")).toBeInTheDocument();
    expect(positionIn(pane)).toBe("– / –");
    const walk = screen.getByTestId("walk");
    expect(walk).toHaveAttribute("data-prev", "");
    expect(walk).toHaveAttribute("data-next", "");
  });
});

describe("SPEC-CORE-191 §2 a queue that failed", () => {
  it("draws the failure line, and × still ends the queue", async () => {
    server.listing = "fail";
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    expect(await within(pane).findByText("Could not load the queue")).toBeInTheDocument();
    const walk = screen.getByTestId("walk");
    expect(walk).toHaveAttribute("data-prev", "");
    expect(walk).toHaveAttribute("data-next", "");
    fireEvent.click(screen.getByRole("button", { name: "Close the queue and show the folder tree" }));
    await waitFor(() => expect(param("queue")).toBeNull());
  });
});

describe("SPEC-CORE-191 §2 / I10 the open file is not in the ready folder queue", () => {
  it("shows – / 3 and no previous or next", async () => {
    openAt("/drive/work/Q1", "file=zz&queue=folder&sort=title&order=asc");
    await fileOpen("zz");
    const pane = await findQueuePane();
    await waitFor(() => expect(positionIn(pane)).toBe("– / 3"));
    const walk = screen.getByTestId("walk");
    expect(walk).toHaveAttribute("data-prev", "");
    expect(walk).toHaveAttribute("data-next", "");
  });
});

describe("SPEC-CORE-191 / I13 with the tree setting off, a started queue shows its pane for the visit", () => {
  it("shows the queue pane without writing tree:enabled, and shows nothing once the queue ends", async () => {
    treeEnabledStore.reset();
    localStorage.clear();
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    expect(pane.closest("[aria-hidden='true']")).toBeNull();
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close the queue and show the folder tree" }));
    await waitFor(() => expect(param("queue")).toBeNull());
    expect(treeShown()).toBe(false);
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();
  });
});

describe("SPEC-CORE-191 step 3 the Smart queue", () => {
  it("SPEC-CORE-109 I5 plays the stored queue on the drive root, named by the stored name and linked to the saved search", async () => {
    storeSmartQueue("work", "sf-live", {
      name: "Stored Name",
      files: SMART_FILES.map((f) => ({ id: f.id, title: f.title, file_type: f.file_type, duration: f.duration })),
    });
    openAt("/drive/work", "file=s1&queue=smart:sf-live");
    await fileOpen("s1");
    const pane = await findQueuePane();
    expect(pane.textContent).toContain("S one");
    expect(pane.textContent).toContain("S two");
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "s2"));
    const link = await within(pane).findByRole("link", { name: /Stored Name/ });
    expect(link.getAttribute("href")).toBe(
      smartFolderHref({ drive: "work", id: "sf-live", query: "cats", file_type: "video" }),
    );
    expect(within(pane).queryByRole("button", { name: "Move up" })).toBeNull();
  });

  it("SPEC-CORE-109 I5 an advance keeps queue=smart", async () => {
    storeSmartQueue("work", "sf-adv", {
      name: "Adv",
      files: SMART_FILES.map((f) => ({ id: f.id, title: f.title, file_type: f.file_type, duration: f.duration })),
    });
    openAt("/drive/work", "file=s1&queue=smart:sf-adv");
    await fileOpen("s1");
    await waitFor(() => expect(screen.getByTestId("walk")).toHaveAttribute("data-next", "s2"));
    await end();
    await fileOpen("s2");
    expect(param("queue")).toBe("smart:sf-adv");
    expect(lastPropsFor("s2")?.autoPlay).toBe(true);
  });

  it("SPEC-CORE-109 I5 a cold queue evaluates the saved query once and does not start the file with Autoplay off", async () => {
    evaluation.fn.mockResolvedValue({ complete: true, files: SMART_FILES });
    openAt("/drive/work", "file=s1&queue=smart:sf-cold");
    await fileOpen("s1");
    const pane = await findQueuePane();
    await waitFor(() => expect(pane.textContent).toContain("S two"));
    expect(evaluation.fn).toHaveBeenCalledTimes(1);
    expect(lastPropsFor("s1")?.autoPlay).not.toBe(true);
  });

  it("SPEC-CORE-109 I5 a failed cold evaluation shows the failure line", async () => {
    evaluation.fn.mockRejectedValue(new Error("API error: 500"));
    openAt("/drive/work", "file=s1&queue=smart:sf-fail");
    await fileOpen("s1");
    const pane = await findQueuePane();
    expect(await within(pane).findByText("Could not load the queue")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-191 §2 queue= on a route without a folder's two-pane layout is ignored", () => {
  it("draws the pane on a folder route and none on a cross-folder view", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder");
    await findQueuePane();
    cleanup();
    openAt("/drive/work", "view=favorites&file=v3&queue=folder");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByLabelText("Queue", { selector: ":not(button)" })).toBeNull();
  });
});

describe("SPEC-CORE-191 step 5 / I5 a choice from the tree keeps or ends the queue", () => {
  it("keeps queue=, sort and order for a file the ready queue holds, and drops them for one it does not", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    await waitFor(() => expect(titleOrder(pane)).toHaveLength(3));

    fireEvent.click(screen.getByTestId("tree-choose-v2"));
    await fileOpen("v2");
    expect(param("queue")).toBe("folder");
    expect(param("sort")).toBe("title");
    expect(param("order")).toBe("asc");

    fireEvent.click(screen.getByTestId("tree-choose-zz"));
    await fileOpen("zz");
    expect(param("queue")).toBeNull();
    expect(param("sort")).toBeNull();
    expect(param("order")).toBeNull();
  });

  it("keeps queue= for any choice while the queue is still loading", async () => {
    server.listing = "hang";
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const pane = await findQueuePane();
    expect(within(pane).getByText("Loading the queue…")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tree-choose-zz"));
    await fileOpen("zz");
    expect(param("queue")).toBe("folder");
  });
});

describe("SPEC-CORE-193 / I9 on a phone the queue opens over the file page", () => {
  beforeEach(() => {
    installMatchMedia();
    setWidth(390);
  });

  afterEach(() => {
    setWidth(1024);
  });

  async function openOverlay() {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    await act(async () => {
      treeNarrowOpenStore.set("work", true);
    });
    const pane = await findQueuePane();
    expect(pane.closest("[aria-hidden='true']")).toBeNull();
    await waitFor(() => expect(titleOrder(pane)).toHaveLength(3));
    return pane;
  }

  it("does not open by itself, and opens from the narrow-open state without remounting the file", async () => {
    openAt("/drive/work/Q1", "file=v3&queue=folder&sort=title&order=asc");
    await fileOpen("v3");
    const mounts = view.mounts;
    expect(treeNarrowOpenStore.get("work")).toBe(false);
    await act(async () => {
      treeNarrowOpenStore.set("work", true);
    });
    const pane = await findQueuePane();
    expect(pane.closest("[aria-hidden='true']")).toBeNull();
    expect(view.mounts).toBe(mounts);
  });

  it("closes when a row is chosen, with that file selected and the queue kept", async () => {
    const pane = await openOverlay();
    fireEvent.click(within(pane).getByText("Delta"));
    await fileOpen("v2");
    await waitFor(() => expect(treeNarrowOpenStore.get("work")).toBe(false));
    expect(param("queue")).toBe("folder");
  });

  it("closes from its close row without changing the file or the queue", async () => {
    await openOverlay();
    const mounts = view.mounts;
    fireEvent.click(screen.getByRole("button", { name: "Close the queue" }));
    await waitFor(() => expect(treeNarrowOpenStore.get("work")).toBe(false));
    expect(param("file")).toBe("v3");
    expect(param("queue")).toBe("folder");
    expect(view.mounts).toBe(mounts);
  });
});
