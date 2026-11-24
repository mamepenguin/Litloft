/**
 * SPEC-CORE-156: the name field on Video's and Reading's See all pages. The
 * page holds the name in its URL `q`, always open in its header; requests
 * carry it as `search`; a Library-origin page also hands it back to the
 * Library's store.
 */

import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLibraryFilters, resetLibraryFilters } from "@/components/appshell/libraryFilters";

const DRIVE = "main";
const NAME = "kyoto";

let nickname: string | null = "alice";
let search = new URLSearchParams();
let pathname = "/drive/main/apps/video/shelf";
const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();
const getCollections = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
}));

type Params = Record<string, unknown>;

interface AppCase {
  id: "video" | "reading";
  route: string;
  key: string;
  card: (search: unknown) => string;
}

const APPS: AppCase[] = [
  { id: "video", route: "@/app/drive/[name]/apps/video/shelf/page", key: "Movies", card: (s) => `${s ? `${String(s)} ` : ""}Video v1` },
  { id: "reading", route: "@/app/drive/[name]/apps/reading/shelf/page", key: "Books", card: (s) => `${s ? `${String(s)} ` : ""}Book b1` },
];

let app: AppCase;

function item(id: string, title: string) {
  const video = app.id === "video";
  return {
    id,
    filename: video ? `${title}.mp4` : `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: video ? "video" : "document",
    mime_type: video ? "video/mp4" : "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: video ? 120 : null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function shelves(_d: string, p: Params) {
  if (p.key === undefined) {
    return { by: p.by, total_shelves: 1, shelves: [{ key: "all", label: "", count: 1, items: [] }] };
  }
  return {
    by: p.by,
    total_shelves: 1,
    shelves: [{ key: p.key, label: String(p.key), count: 1, items: [item("x1", app.card(p.search))] }],
  };
}

function searchObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}

/** Renders the route as Next.js would, whether it is an async server page or a client page. */
async function renderRoute(query: string) {
  search = new URLSearchParams(query);
  pathname = `/drive/${DRIVE}/apps/${app.id}/shelf`;
  const mod = await import(/* @vite-ignore */ app.route);
  const Page = mod.default as (props: Record<string, unknown>) => ReactElement | Promise<ReactElement>;
  const element = async () => {
    const props = {
      params: Promise.resolve({ name: DRIVE }),
      searchParams: Promise.resolve(searchObject(search)),
    };
    return Page.constructor.name === "AsyncFunction" ? await Page(props) : <Page {...props} />;
  };
  const view = render(await element());
  return {
    ...view,
    /** The URL changes under the page, as Back does. */
    go: async (next: string) => {
      search = new URLSearchParams(next);
      view.rerender(await element());
    },
  };
}

const shelfCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.key === app.key);

const nameInput = () => screen.getByRole("searchbox", { name: "Filter by name" }) as HTMLInputElement;
const queryNameInput = () => screen.queryByRole("searchbox", { name: "Filter by name" });

function lastReplace(): URL {
  expect(replace).toHaveBeenCalled();
  return new URL(String(replace.mock.calls.at(-1)![0]), `http://localhost${pathname}`);
}

const replacedWith = (q: string | null) =>
  replace.mock.calls.some(([href]) => new URL(String(href), "http://localhost").searchParams.get("q") === q);

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  replace.mockReset();
  push.mockReset();
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
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
  getShelves.mockReset().mockImplementation(async (d: string, p: Params) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 1, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-156 the $id See all page", (appCase) => {
  beforeEach(() => {
    app = appCase;
  });

  describe("I12 the field in the header", () => {
    it("SPEC-CORE-156 I12 draws the field always open, holding the URL's q, with no icon", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);

      await waitFor(() => expect(nameInput().value).toBe(NAME));
      expect(screen.queryByRole("button", { name: "Filter by name" })).toBeNull();
    });

    it("SPEC-CORE-156 I12 draws the field open and empty without q, and it stays open on blur and Escape", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library`);
      await screen.findByText(app.card(undefined));

      fireEvent.focus(nameInput());
      fireEvent.keyDown(nameInput(), { key: "Escape" });
      fireEvent.blur(nameInput());

      expect(nameInput().value).toBe("");
      expect(screen.queryByRole("button", { name: "Filter by name" })).toBeNull();
    });

    it("SPEC-CORE-156 I12 the field comes before the sort", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);
      await screen.findByText(app.card(NAME));

      const sort = screen.getAllByRole("button", { name: /Sort/ })[0];
      expect(nameInput().compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("SPEC-CORE-156 I2 I12 a page that cannot list draws no field and sends no q", async () => {
      const listing = await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);
      await waitFor(() => expect(nameInput().value).toBe(NAME));
      listing.unmount();
      getShelves.mockClear();

      await renderRoute(`by=bogus&key=${app.key}&from=library&q=${NAME}`);
      await act(async () => {});

      expect(queryNameInput()).toBeNull();
      for (const call of getShelves.mock.calls) expect(JSON.stringify(call)).not.toContain(NAME);
    });
  });

  describe("I1 I10 the requests", () => {
    it("SPEC-CORE-156 I1 every shelves request carries search=q from the first render, and the answer is drawn", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);

      expect(await screen.findByText(app.card(NAME))).toBeInTheDocument();
      expect(shelfCalls().length).toBeGreaterThan(0);
      for (const p of shelfCalls()) expect(p.search).toBe(NAME);
    });

    it("SPEC-CORE-156 I10 an untrimmed q is replaced by its trimmed form, without a history entry, and requests use it", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${encodeURIComponent(`  ${NAME}  `)}`);

      await waitFor(() => expect(replacedWith(NAME)).toBe(true));
      expect(push).not.toHaveBeenCalled();
      expect(lastReplace().searchParams.get("key")).toBe(app.key);
      await screen.findByText(app.card(NAME));
      for (const p of shelfCalls()) expect(p.search).toBe(NAME);
      expect(nameInput().value).toBe(NAME);
    });

    it("SPEC-CORE-156 I10 a q over 200 characters is replaced by its first 200, and no request carries more", async () => {
      const long = "x".repeat(250);
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${long}`);

      await waitFor(() => expect(replacedWith("x".repeat(200))).toBe(true));
      expect(push).not.toHaveBeenCalled();
      await waitFor(() => expect(shelfCalls().length).toBeGreaterThan(0));
      for (const p of shelfCalls()) expect(p.search).toBe("x".repeat(200));
    });

    it("SPEC-CORE-156 I10 a q of only spaces is removed, and no request carries search", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${encodeURIComponent("   ")}`);

      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(lastReplace().searchParams.has("q")).toBe(false);
      expect(lastReplace().searchParams.get("key")).toBe(app.key);
      await screen.findByText(app.card(undefined));
      for (const p of shelfCalls()) expect(p.search).toBeUndefined();
    });

    it("SPEC-CORE-156 a q changed under the page, as by Back, is shown and requested", async () => {
      const view = await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);
      await screen.findByText(app.card(NAME));

      await view.go(`by=folder&key=${app.key}&from=library&q=osaka`);

      expect(await screen.findByText(app.card("osaka"))).toBeInTheDocument();
      expect(nameInput().value).toBe("osaka");
      expect(shelfCalls().at(-1)!.search).toBe("osaka");
    });
  });

  describe("I5 an applied change", () => {
    it.each(["from=library", "from=discover", ""])(
      "SPEC-CORE-156 I5 replaces q without a history entry, keeping the rest of the URL (%s)",
      async (from) => {
        await renderRoute(`by=folder&key=${app.key}&${from}`);
        await screen.findByText(app.card(undefined));

        fireEvent.change(nameInput(), { target: { value: "osaka" } });

        await waitFor(() => expect(replacedWith("osaka")).toBe(true));
        expect(push).not.toHaveBeenCalled();
        expect(lastReplace().searchParams.get("by")).toBe("folder");
        expect(lastReplace().searchParams.get("key")).toBe(app.key);
      },
    );

    it("SPEC-CORE-156 I5 × removes q by replace", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);
      await screen.findByText(app.card(NAME));

      fireEvent.click(screen.getByRole("button", { name: "Clear input" }));

      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(lastReplace().searchParams.has("q")).toBe(false);
      expect(push).not.toHaveBeenCalled();
    });

    it("SPEC-CORE-156 I5 on a from=library page it is also the Library's name", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library`);
      await screen.findByText(app.card(undefined));

      fireEvent.change(nameInput(), { target: { value: "osaka" } });

      await waitFor(() => expect(replacedWith("osaka")).toBe(true));
      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: "osaka" });
    });

    it.each(["from=discover", ""])("SPEC-CORE-156 I5 on a page with %s it leaves the Library's name alone", async (from) => {
      await renderRoute(`by=folder&key=${app.key}&${from}`);
      await screen.findByText(app.card(undefined));

      fireEvent.change(nameInput(), { target: { value: "osaka" } });

      await waitFor(() => expect(replacedWith("osaka")).toBe(true));
      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: "" });
    });

    it("SPEC-CORE-156 I5 opening a from=library page with q writes nothing to the Library's name", async () => {
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);

      await screen.findByText(app.card(NAME));
      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: "" });
    });

    it("SPEC-CORE-156 I4 I13 text typed less than 300ms before leaving a from=library page is the Library's name, and the URL is not replaced", async () => {
      const view = await renderRoute(`by=folder&key=${app.key}&from=library`);
      await screen.findByText(app.card(undefined));

      fireEvent.change(nameInput(), { target: { value: "osaka" } });
      view.unmount();
      await new Promise((r) => setTimeout(r, 400));

      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: "osaka" });
      expect(replacedWith("osaka")).toBe(false);
    });

    it("SPEC-CORE-156 I13 text typed less than 300ms before leaving a from=discover page is dropped", async () => {
      const view = await renderRoute(`by=folder&key=${app.key}&from=discover`);
      await screen.findByText(app.card(undefined));

      fireEvent.change(nameInput(), { target: { value: "osaka" } });
      view.unmount();
      await new Promise((r) => setTimeout(r, 400));

      expect(replacedWith("osaka")).toBe(false);
      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: "" });
    });
  });

  describe("I5 a Target choice on the page", () => {
    it("SPEC-CORE-156 I5 drops q by replace, and no request after the choice carries it", async () => {
      getSmartFolders.mockResolvedValue([
        { id: "sf", drive: DRIVE, name: "Trips", query: "path:Movies", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
      ]);
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);
      await screen.findByText(app.card(NAME));
      const before = getShelves.mock.calls.length;

      fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Trips/ }));

      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(lastReplace().searchParams.has("q")).toBe(false);
      expect(lastReplace().searchParams.get("key")).toBe(app.key);
      expect(push).not.toHaveBeenCalled();
      await waitFor(() => expect(getShelves.mock.calls.length).toBeGreaterThan(before));
      for (const [, p] of getShelves.mock.calls.slice(before)) expect((p as Params).search).toBeUndefined();
    });
  });

  describe("I9 the empty state", () => {
    it("SPEC-CORE-156 I9 a q that leaves nothing says Nothing matches these filters", async () => {
      getShelves.mockImplementation(async (d: string, p: Params) =>
        p.search !== undefined && p.key !== undefined
          ? { by: p.by, total_shelves: 1, shelves: [{ key: p.key, label: String(p.key), count: 0, items: [] }] }
          : shelves(d, p),
      );
      await renderRoute(`by=folder&key=${app.key}&from=library&q=${NAME}`);

      expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
      expect(nameInput().value).toBe(NAME);
    });
  });
});
