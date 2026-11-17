/**
 * SPEC-CORE-116 step 4, I4, I5 in the search window: an `in:` name resolves
 * inside the debounce, before the window's requests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { GlobalSearchProvider } from "../search/GlobalSearchProvider";
import { invalidateAddonsCache } from "@/lib/addons";
import type { FileItem } from "@/types";
import {
  fileIdsOf,
  installWireFetch,
  json,
  never,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => DRIVE,
  useSetOverrideDrive: () => () => {},
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: () => Promise.resolve([]),
  getDriveTags: () => Promise.resolve([]),
  getPins: () => Promise.resolve([]),
  getDriveSummary: () => Promise.resolve({ missing_count: 0 }),
  getAuthStatus: () => Promise.resolve({ is_admin: false }),
}));

const cache = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => cache.read(...args),
  writeSearchCache: (...args: unknown[]) => cache.write(...args),
  clearSearchCache: vi.fn(),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => <span data-testid={`icon-${fileType}`} />,
}));

Element.prototype.scrollIntoView = vi.fn();

function file(id: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.md`,
    title: id,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
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

const smartFolder = (id: string, name: string, query: string) => ({
  id,
  drive: DRIVE,
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
});

const COULD_NOT_LOAD = "Could not load the collection";
const TOO_LARGE = "The scope is too large (up to 10,000 files). Narrow it down.";
const MEMBERS = [file("m1"), file("m2")];

const server = {
  evaluate: null as null | ((call: WireCall) => Response | Promise<Response>),
  /** The saved query of each Smart Collection is a word; its members are that word's listing. */
  members: { dogs: MEMBERS, birds: [file("b1")] } as Record<string, FileItem[]>,
  addonOn: false,
};
let wire: { calls: WireCall[] };

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const evaluationWord = (c: WireCall) => {
  const word = c.url.searchParams.get("search") ?? "";
  return word in server.members ? word : null;
};
const isEvaluation = (c: WireCall) => isListing(c) && evaluationWord(c) !== null;
const evaluations = () => wire.calls.filter(isEvaluation);
/**
 * Asked once per drive for the module's lifetime, so only the first case of
 * the file to open the window sends it; it is not a request of the query.
 */
const IMAGE_AVAILABILITY = "/api/addons/intelligence/search/by-image/available";
const windowRequests = () =>
  wire.calls.filter(
    (c) =>
      (isListing(c) && !isEvaluation(c)) ||
      isFilesQuery(c) ||
      (c.url.pathname.startsWith("/api/addons/intelligence") &&
        c.url.pathname !== IMAGE_AVAILABILITY),
  );

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  server.evaluate = null;
  server.members = { dogs: MEMBERS, birds: [file("b1")] };
  server.addonOn = false;
  cache.read.mockReset().mockReturnValue(null);
  cache.write.mockReset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/addons/status") {
      return json({
        addons: server.addonOn ? { intelligence: { label: "Intelligence", icon: "sparkles" } } : {},
        slots: {},
      });
    }
    if (path === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      return json([
        smartFolder("sf-weekly", "Weekly", "dogs"),
        smartFolder("sf-daily", "Daily", "birds"),
      ]);
    }
    const word = evaluationWord(call);
    if (isListing(call) && word) {
      return server.evaluate ? server.evaluate(call) : pagedListing(server.members[word], call);
    }
    if (isListing(call)) return pagedListing([file("g1")], call);
    if (isFilesQuery(call)) {
      const members = fileIdsOf(call);
      const data = members === null ? [file("p1")] : members.map((id) => file(id));
      return json({ data, meta: { total: data.length, page: 1, limit: 8 } });
    }
    if (path === "/api/addons/intelligence/search") {
      return json({ available: true, results: [] });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function shell() {
  return render(
    <ShortcutsProvider>
      <GlobalSearchProvider>
        <GlobalSearch />
      </GlobalSearchProvider>
    </ShortcutsProvider>,
  );
}

const input = () => screen.getAllByRole("textbox")[0];

function typeQuery(value: string) {
  fireEvent.change(input(), { target: { value } });
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });

describe("SPEC-CORE-116 step 4, I4: the window resolves in: to members", () => {
  it("lists through POST files/query with the members, never sending the name", async () => {
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    for (const call of wire.calls.filter(isFilesQuery)) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((f) => f.id)));
      expect(paramsOf(call, "collection")).toEqual([]);
    }
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);
  });

  it("reuses the resolution while the in: key is unchanged", async () => {
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    const evaluated = evaluations().length;

    typeQuery('cats in:"weekly"');
    await waitFor(() =>
      expect(wire.calls.filter(isFilesQuery).some((c) => c.url.searchParams.get("search") === "cats")).toBe(true),
    );

    expect(evaluations().length).toBe(evaluated);
  });

  it("neither reads nor writes the search cache for an in: query", async () => {
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    await settle();

    const touched = [...cache.read.mock.calls, ...cache.write.mock.calls].filter((args) =>
      JSON.stringify(args).includes("in:"),
    );
    expect(touched).toEqual([]);
  });
});

describe("SPEC-CORE-116 step 4, I5: resolving, failed and too large in the window", () => {
  it("sends nothing while the evaluation runs", async () => {
    server.evaluate = () => never();
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');

    await waitFor(() => expect(evaluations().length).toBeGreaterThan(0));
    await settle();

    expect(windowRequests()).toEqual([]);
  });

  it.each([
    ["failed", COULD_NOT_LOAD, () => (server.evaluate = () => json({ detail: "boom" }, 500))],
    ["too large", TOO_LARGE, () => (server.members.dogs = Array.from({ length: 10_001 }, (_, i) => file(`k${i}`)))],
  ])("%s: shows the message where no results would show, with no retry", async (_label, message, arrange) => {
    arrange();
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');

    expect(await screen.findByText(message, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No matching files found")).not.toBeInTheDocument();
    expect(windowRequests()).toEqual([]);
  });
});

describe("SPEC-CORE-116 step 4, I4: the window's in: key change and its meaning search", () => {
  it("a new key evaluates again and lists the second set", async () => {
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('in:"Weekly"');
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    expect(await screen.findByText(file("m1").filename)).toBeInTheDocument();
    const evaluated = evaluations().length;

    typeQuery('in:"Daily"');

    await waitFor(() =>
      expect(wire.calls.filter(isFilesQuery).some((c) => new Set(fileIdsOf(c)).has("b1"))).toBe(true),
    );
    expect(evaluations().length).toBeGreaterThan(evaluated);
    expect(await screen.findByText(file("b1").filename)).toBeInTheDocument();
    for (const id of MEMBERS.map((member) => member.id)) {
      expect(screen.queryByText(file(id).filename)).toBeNull();
    }
    for (const call of wire.calls.filter(isFilesQuery)) {
      const sent = new Set(fileIdsOf(call));
      expect(sent.has("m1") && sent.has("b1")).toBe(false);
    }
  });

  it("the meaning search carries the members and a filter without the Smart name", async () => {
    server.addonOn = true;
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    typeQuery('cats in:"Weekly"');
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    const meaning = () =>
      wire.calls.filter(
        (c) =>
          c.url.pathname === "/api/addons/intelligence/search" &&
          !((c.url.searchParams.get("q") ?? "") in server.members),
      );
    await waitFor(() => expect(meaning().length).toBeGreaterThan(0));
    for (const call of meaning()) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((member) => member.id)));
      const filter = JSON.parse(paramsOf(call, "filter")[0]) as { collections?: string[] };
      expect((filter.collections ?? []).map((name) => name.toLowerCase())).not.toContain("weekly");
    }
  });
});
