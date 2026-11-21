/**
 * SPEC-CORE-156 I12: a See all page that cannot list draws no name field and
 * sends no `q`, even when the URL carries one. Video's watch state without a
 * profile and Reading's unreadable key are the two states the acceptance
 * tests leave.
 */

import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const DRIVE = "main";
const NAME = "kyoto";

let nickname: string | null = null;
let search = new URLSearchParams();
let pathname = "/drive/main/apps/video/shelf";
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
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
  query: string;
}

const APPS: AppCase[] = [
  { id: "video", route: "@/app/drive/[name]/apps/video/shelf/page", query: `by=watch&key=in_progress&q=${NAME}` },
  { id: "reading", route: "@/app/drive/[name]/apps/reading/shelf/page", query: `by=tag&key=&q=${NAME}` },
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

function shelvesAnswer(params: Params) {
  const search = typeof params.search === "string" ? params.search : "none";
  return {
    by: params.by,
    total_shelves: 1,
    shelves: [{ key: params.key, label: String(params.key), count: 1, items: [item(search, `${search} card`)] }],
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

async function renderRoute(query = app.query) {
  search = new URLSearchParams(query);
  pathname = `/drive/${DRIVE}/apps/${app.id}/shelf`;
  const mod = await import(/* @vite-ignore */ app.route);
  const Page = mod.default as (props: Record<string, unknown>) => ReactElement;
  const element = () => (
    <Page
      params={Promise.resolve({ name: DRIVE })}
      searchParams={Promise.resolve(searchObject(search))}
    />
  );
  const view = render(element());
  return {
    ...view,
    /** The URL changes under the page, as an applied name's replace does. */
    go: (next: string) => {
      search = new URLSearchParams(next);
      view.rerender(element());
    },
  };
}

beforeEach(() => {
  nickname = null;
  replace.mockReset();
  getShelves.mockReset().mockImplementation(async (_d: string, params: Params) => shelvesAnswer(params));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-156 $id See all listing mode", (appCase) => {
  beforeEach(() => {
    app = appCase;
  });

  it("SPEC-CORE-156 I12 draws no field and sends no search when the page cannot list", async () => {
    await renderRoute();
    await act(async () => {});

    expect(screen.queryByRole("searchbox", { name: "Filter by name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Filter by name" })).toBeNull();
    for (const call of getShelves.mock.calls) {
      const params = call[1] as Params;
      expect(params.search).toBeUndefined();
    }
    for (const call of getShelves.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(NAME);
    }
  });

  it("SPEC-CORE-156 I3 never draws the answer for a name the URL has left", async () => {
    let releaseOld: (() => void) | null = null;
    getShelves.mockImplementation(async (_d: string, params: Params) => {
      if (params.search === "old") {
        await new Promise<void>((resolve) => {
          releaseOld = resolve;
        });
      }
      return shelvesAnswer(params);
    });
    const key = app.id === "video" ? "Movies" : "Books";
    const view = await renderRoute(`by=folder&key=${key}&q=old`);

    await waitFor(() => expect(releaseOld).not.toBeNull());
    view.go(`by=folder&key=${key}&q=new`);

    expect(await screen.findByText("new card")).toBeInTheDocument();
    await act(async () => releaseOld!());

    expect(screen.queryByText("old card")).toBeNull();
    expect(screen.getByText("new card")).toBeInTheDocument();
  });
});
