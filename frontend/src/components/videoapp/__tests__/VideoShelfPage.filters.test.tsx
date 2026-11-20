/**
 * SPEC-CORE-147 I4 I6: the Video See all route reads `tag` and `watch` from
 * its URL and requests with them, as Reading's does.
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DRIVE = "main";

let nickname: string | null = "alice";
let search = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
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

function item(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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
  const path = "@/app/drive/[name]/apps/video/shelf/page";
  const mod = await import(/* @vite-ignore */ path);
  const Page = mod.default as (props: Record<string, unknown>) => ReactElement | Promise<ReactElement>;
  const props = {
    params: Promise.resolve({ name: DRIVE }),
    searchParams: Promise.resolve(searchObject(search)),
  };
  if (Page.constructor.name === "AsyncFunction") {
    return render(await Page(props));
  }
  return render(<Page {...props} />);
}

function shelfCall(): Params | undefined {
  return getShelves.mock.calls
    .map(([, p]) => p as Params)
    .find((p) => p.by === "folder" && p.key === "Movies");
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  replace.mockReset();
  push.mockReset();
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
  getShelves.mockReset().mockImplementation(async (_d: string, p: Params) => ({
    by: p.by,
    total_shelves: 1,
    shelves: [{ key: p.key, label: String(p.key), count: 1, items: [item("v1")] }],
  }));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 1, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-147 I4 I6 the Video See all route reads its filters", () => {
  it("SPEC-CORE-147 I4 requests with every tag and the state in its URL", async () => {
    await renderRoute("by=folder&key=Movies&from=library&tag=Trip&tag=Cats&watch=finished");

    await screen.findByText("Video v1");
    await waitFor(() => expect(shelfCall()).toBeDefined());
    expect(shelfCall()).toMatchObject({ tag: ["Trip", "Cats"], watch: "finished" });
  });

  it("SPEC-CORE-147 I4 a single tag is sent as a one-element list", async () => {
    await renderRoute("by=folder&key=Movies&from=library&tag=Trip");

    await screen.findByText("Video v1");
    expect(shelfCall()).toMatchObject({ tag: ["Trip"] });
    expect(shelfCall()?.watch).toBeUndefined();
  });

  it.each(["in_progress", "unwatched", "finished"])(
    "SPEC-CORE-147 I4 passes watch=%s through",
    async (watch) => {
      await renderRoute(`by=folder&key=Movies&from=library&watch=${watch}`);

      await screen.findByText("Video v1");
      expect(shelfCall()).toMatchObject({ watch });
    },
  );

  it("SPEC-CORE-147 I6 without a profile leaves watch out of the request but keeps the tags, and leaves the URL alone", async () => {
    nickname = null;
    await renderRoute("by=folder&key=Movies&from=library&tag=Trip&watch=finished");

    await screen.findByText("Video v1");
    expect(shelfCall()).toMatchObject({ tag: ["Trip"] });
    expect(getShelves.mock.calls.every(([, p]) => (p as Params).watch === undefined)).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-147 an unknown watch value is left out of the request, the tags kept, and the URL left alone", async () => {
    await renderRoute("by=folder&key=Movies&from=library&tag=Trip&watch=half");

    await screen.findByText("Video v1");
    expect(shelfCall()).toMatchObject({ tag: ["Trip"] });
    expect(getShelves.mock.calls.every(([, p]) => (p as Params).watch === undefined)).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-147 I5 choosing another Target on the page drops tag and watch from its URL by replace", async () => {
    getSmartFolders.mockResolvedValue([
      { id: "sf", drive: DRIVE, name: "Trips", query: "path:Movies", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
    ]);
    await renderRoute("by=folder&key=Movies&from=library&tag=Trip&watch=finished");
    await screen.findByText("Video v1");

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Trips/ }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const href = new URL(String(replace.mock.calls.at(-1)?.[0]), "http://localhost");
    expect(href.searchParams.has("tag")).toBe(false);
    expect(href.searchParams.has("watch")).toBe(false);
    expect(href.searchParams.get("key")).toBe("Movies");
    expect(push).not.toHaveBeenCalled();
  });
});
