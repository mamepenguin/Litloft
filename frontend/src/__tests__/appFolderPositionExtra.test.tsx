/**
 * The folder position's remaining inputs: a member target's POST requests carry
 * the narrowed position, the URL cleans a value the backend would reject, and
 * the rows stay away while the target is loading, failed, unusable or empty.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { appRequests } from "@/lib/memberTarget";
import { installWireFetch, json, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    pathname: "/drive/main/apps/video",
    search: new URLSearchParams(),
    entries: [] as string[],
    index: -1,
  };
  const apply = (href: string) => {
    const url = new URL(href, `http://localhost${state.pathname}`);
    state.pathname = url.pathname;
    state.search = new URLSearchParams(url.search);
    for (const listener of [...listeners]) listener();
  };
  return {
    state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset(pathname: string, query: string) {
      state.pathname = pathname;
      state.search = new URLSearchParams(query);
      state.entries = [`${pathname}?${query}`];
      state.index = 0;
    },
    go(href: string, mode: "push" | "replace") {
      const full = new URL(href, `http://localhost${state.pathname}`);
      const entry = `${full.pathname}${full.search}`;
      if (mode === "push") {
        state.entries = [...state.entries.slice(0, state.index + 1), entry];
        state.index += 1;
      } else {
        state.entries = state.entries.map((e, i) => (i === state.index ? entry : e));
      }
      apply(entry);
    },
    back() {
      state.index -= 1;
      apply(state.entries[state.index]);
    },
    push: vi.fn(),
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    usePathname: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.pathname),
    useSearchParams: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.search),
    useParams: () => ({ name: "main" }),
    useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  };
});

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const evaluate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/smartCollectionEval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/smartCollectionEval")>()),
  evaluateSmartCollection: evaluate,
}));

const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;
const ReadingRoute = (await import("@/app/drive/[name]/apps/reading/page")).default;
const { LibraryFace: VideoLibraryFace } = await import("@/components/videoapp/LibraryFace");
const { LibraryFace: ReadingLibraryFace } = await import("@/components/readingapp/LibraryFace");

type AppCase = {
  id: "video" | "reading";
  Route: () => React.ReactNode;
  Library: typeof VideoLibraryFace | typeof ReadingLibraryFace;
  params: Record<string, unknown>;
  kinds: ("video" | "document")[];
};

const APPS: AppCase[] = [
  {
    id: "video",
    Route: VideoRoute,
    Library: VideoLibraryFace,
    params: { type: ["video"] },
    kinds: ["video"],
  },
  {
    id: "reading",
    Route: ReadingRoute,
    Library: ReadingLibraryFace,
    params: { type: ["pdf", "epub", "archive"] },
    kinds: ["document"],
  },
];

const appPath = (app: AppCase) => `/drive/${DRIVE}/apps/${app.id}`;
const path = (call: WireCall) => call.url.pathname;
const param = (call: WireCall, key: string) => call.url.searchParams.get(key);
const isShelves = (call: WireCall) => path(call).endsWith("/shelves");
const isShelvesQuery = (call: WireCall) => path(call).endsWith("/shelves/query");
const isChips = (call: WireCall) =>
  (isShelves(call) || isShelvesQuery(call)) &&
  param(call, "by") === "folder" &&
  param(call, "shelf_limit") === "24";
const isCount = (call: WireCall) => isShelves(call) && param(call, "by") === "all" && param(call, "per_shelf") === "1";

function foldersOf(call: WireCall): string[] {
  const body = call.body as { folder?: unknown } | null;
  const fromBody = body && Array.isArray(body.folder) ? (body.folder as string[]) : [];
  return [...paramsOf(call, "folder"), ...fromBody];
}

const chip = (key: string) => ({ key, label: key.split("/").at(-1), count: 2, items: [] });

function answerShelves(call: WireCall): Response {
  const by = param(call, "by") ?? "all";
  if (by === "folder") {
    const position = foldersOf(call)[0] ?? "";
    const shelves = position === ""
      ? [chip("Videos"), chip("Archive"), chip("Music")]
      : [chip(`${position}/Study`), chip(`${position}/Fun`)];
    return json({ by, base: position, total_shelves: shelves.length, shelves });
  }
  return json({
    by,
    base: "",
    total_shelves: 1,
    shelves: [{ key: "k", label: "Grouped", count: 2, items: [] }],
  });
}

function smartFolder(id: string, name: string, query: string, fileType: string | null = null) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const released: (() => void)[] = [];
let smartFolders: Answer = () => json([]);

type Answer = (call: WireCall) => Response | Promise<Response>;

function held(answer: Answer): Answer {
  return (call) =>
    new Promise<Response>((resolve) => {
      released.push(() => resolve(answer(call)));
    });
}

let chipAnswer: Answer;
let wire: { calls: WireCall[] };

async function releaseAll() {
  await act(async () => {
    for (const release of released.splice(0)) release();
  });
}

async function settle(ms = 100) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function open(app: AppCase, query: string) {
  nav.reset(appPath(app), query);
  const Route = app.Route;
  return render(<Route />);
}

const lastReplace = () =>
  new URL(String(nav.replace.mock.calls.at(-1)![0]), "http://localhost/");

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  writeAppPrefs(DRIVE, { face: "library" }, "video");
  writeAppPrefs(DRIVE, { face: "library" }, "reading");
  nav.push.mockReset().mockImplementation((href: string) => nav.go(href, "push"));
  nav.replace.mockReset().mockImplementation((href: string) => nav.go(href, "replace"));
  released.length = 0;
  smartFolders = () => json([]);
  chipAnswer = answerShelves;
  evaluate.mockReset();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  wire = installWireFetch((call) => {
    if (path(call).endsWith("/smart-folders")) return smartFolders(call);
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path(call).endsWith("/home-shortcuts")) return json([]);
    if (path(call).endsWith("/collections")) return json([]);
    if (path(call).includes("/tag-counts")) return json([]);
    if (path(call).endsWith("/files") || path(call).endsWith("/files/query"))
      return json({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    if (isChips(call)) return chipAnswer(call);
    if (isShelves(call) || isShelvesQuery(call)) return answerShelves(call);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("$id a member target's requests", (appCase) => {
  it("carry the narrowed folder in both POST bodies", async () => {
    const requests = appRequests({ id: "sf-member", kinds: appCase.kinds }, ["m1", "m2"]);
    const Library = appCase.Library as typeof VideoLibraryFace;
    render(
      <Library
        drive={DRIVE}
        params={appCase.params as never}
        requests={requests}
        empty={false}
        group="tag"
        hasProfile
        position="Videos/Study"
        sortId="newest"
        onGroup={() => {}}
        onSort={() => {}}
        onViewerRejected={() => {}}
      />,
    );

    await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    await waitFor(() =>
      expect(wire.calls.some((call) => path(call).endsWith("/tag-counts/query"))).toBe(true),
    );
    await settle();

    const posts = wire.calls.filter(
      (call) => isShelvesQuery(call) || path(call).endsWith("/tag-counts/query"),
    );
    expect(posts.some((call) => isShelvesQuery(call) && param(call, "by") === "tag")).toBe(true);
    for (const call of posts) {
      expect(foldersOf(call), `${call.url.pathname} ${call.url.search}`).toEqual(["Videos/Study"]);
      expect((call.body as { file_ids?: string[] }).file_ids).toEqual(["m1", "m2"]);
    }
  });
});

describe.each(APPS)("$id a folder value the backend would reject", (appCase) => {
  it("removes an empty folder= with replace and sends no folder", async () => {
    open(appCase, "folder=");
    await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
    await settle();

    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalled();
    expect(lastReplace().searchParams.has("folder")).toBe(false);
    expect(screen.queryByLabelText("Folder position")).toBeNull();
    for (const call of wire.calls) expect(foldersOf(call)).toEqual([]);
  });

  it("sends a trailing slash away as the normalised folder, without a replace", async () => {
    open(appCase, `folder=${encodeURIComponent("Videos/Study/")}`);
    await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
    await settle();

    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    for (const call of wire.calls.filter(
      (c) => (isShelves(c) || isShelvesQuery(c)) && !isCount(c),
    )) {
      expect(foldersOf(call)).toEqual(["Videos/Study"]);
    }
    expect(screen.getByLabelText("Folder position").textContent).toContain("Study");
  });
});

describe.each(APPS)("$id the rows while the target is not usable", (appCase) => {
  const noRows = async () => {
    await settle(200);
    expect(screen.queryByLabelText("Folder position")).toBeNull();
    expect(screen.queryByTestId("folder-chips")).toBeNull();
    expect(wire.calls.filter(isChips)).toEqual([]);
  };

  it("draws nothing while the saved target is loading", async () => {
    smartFolders = held(() => json([smartFolder("sf-cats", "Cats", "cats")]));
    writeAppPrefs(DRIVE, { face: "library", target: "sf-cats" }, appCase.id);
    open(appCase, "folder=Videos/Study");

    await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/smart-folders"))).toBe(true));
    await noRows();
  });

  it("draws nothing while the member target evaluates", async () => {
    smartFolders = () => json([smartFolder("sf-cats", "Cats", "cats")]);
    evaluate.mockReturnValue(new Promise(() => {}));
    writeAppPrefs(DRIVE, { face: "library", target: "sf-cats" }, appCase.id);
    open(appCase, "folder=Videos/Study");

    await waitFor(() => expect(evaluate).toHaveBeenCalled());
    await noRows();
  });

  it("draws nothing when the member target fails", async () => {
    smartFolders = () => json([smartFolder("sf-cats", "Cats", "cats")]);
    evaluate.mockResolvedValue({ files: [], complete: false });
    writeAppPrefs(DRIVE, { face: "library", target: "sf-cats" }, appCase.id);
    open(appCase, "folder=Videos/Study");

    await waitFor(() => expect(evaluate).toHaveBeenCalled());
    await noRows();
  });

  it("draws nothing when the member target is too large", async () => {
    smartFolders = () => json([smartFolder("sf-cats", "Cats", "cats")]);
    evaluate.mockResolvedValue({
      files: Array.from({ length: 10_001 }, (_, i) => ({ id: `m${i}` })),
      complete: true,
    });
    writeAppPrefs(DRIVE, { face: "library", target: "sf-cats" }, appCase.id);
    open(appCase, "folder=Videos/Study");

    await waitFor(() => expect(evaluate).toHaveBeenCalled());
    await noRows();
  });

  it("draws nothing for a target that intersects no kind", async () => {
    smartFolders = () => json([smartFolder("sf-pics", "Pictures", "cats", "image")]);
    writeAppPrefs(DRIVE, { face: "library", target: "sf-pics" }, appCase.id);
    open(appCase, "folder=Videos/Study");

    await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/smart-folders"))).toBe(true));
    await noRows();
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe("a Back while the next position's chips are still loading", () => {
  const video = APPS[0];

  it("shows the earlier position's chips, never the late answer's", async () => {
    chipAnswer = (call) =>
      foldersOf(call).includes("Videos") && foldersOf(call).length > 0
        ? held(answerShelves)(call)
        : answerShelves(call);
    open(video, "");
    await waitFor(() => expect(screen.queryByTestId("folder-chips")).not.toBeNull());

    fireEvent.click(screen.getByRole("link", { name: /^Videos/ }));
    await waitFor(() => expect(screen.getByLabelText("Folder position")).toBeInTheDocument());
    await settle();

    await act(async () => nav.back());
    await waitFor(() => expect(screen.queryByLabelText("Folder position")).toBeNull());
    await releaseAll();
    await settle();

    expect(screen.queryByLabelText("Folder position")).toBeNull();
    expect(screen.getByTestId("folder-chips").textContent).toContain("Videos");
    expect(screen.getByTestId("folder-chips").textContent).not.toContain("Study");
  });
});

describe.each(APPS)("$id another target chosen while the URL replace is still pending", (appCase) => {
  it("never asks with the old position under the new target", async () => {
    smartFolders = () => json([smartFolder("sf-trips", "Trips", "tag:Trip")]);
    nav.replace.mockReset().mockImplementation((href: string) => {
      setTimeout(() => nav.go(href, "replace"), 50);
    });
    open(appCase, "folder=Videos%2FStudy");
    await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
    await settle();
    const before = wire.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Trips/ }));
    await settle(200);

    expect(nav.state.search.has("folder")).toBe(false);
    const after = wire.calls.slice(before).filter((call) => isShelves(call) || isShelvesQuery(call));
    expect(after.some(isChips)).toBe(true);
    for (const call of after) expect(foldersOf(call)).not.toContain("Videos/Study");
  });
});

describe.each(APPS)("$id a target with two path folders", (appCase) => {
  it("draws no folder crumb as a link when choosing it would show the current view", async () => {
    smartFolders = () => json([smartFolder("sf-two", "Two paths", "path:Videos/Study/Math path:Music")]);
    writeAppPrefs(DRIVE, { face: "library", target: "sf-two" }, appCase.id);
    open(appCase, "folder=Videos%2FStudy");
    await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
    await settle();

    const crumbs = screen.getByLabelText("Folder position");
    const linkTexts = Array.from(crumbs.querySelectorAll("a")).map((a) => a.textContent?.trim());
    expect(crumbs.textContent).toContain("Videos");
    expect(linkTexts).not.toContain("Videos");
    expect(linkTexts).not.toContain("Study");
    expect(within(crumbs).getByRole("link", { name: "Top" })).toBeInTheDocument();
  });
});
