/**
 * SPEC-CORE-081: the shelf page with `entry` and `slot=recommended` pages through the
 * `video-discover-recommended` entry's page provider under the app's target and
 * `watch=unwatched`, titled Recommended, and only with a profile.
 *
 * The addon modules are stubbed under their real ids because the slot loader resolves
 * `@/addons/<name>/slots.ts` by globbing the linked directory. The knowledge module's stub
 * throws, so an entry of that addon is one whose module fails to import.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { ApiStatusError } from "@/lib/api";
import { writeAppPrefs } from "@/lib/appPrefs";
import enMessages from "@/messages/en.json";
import { VideoShelfPage } from "../VideoShelfPage";
import { deferred, item, title, type Entry, type Params } from "./discoverHarness";

const { catalogue, intel, intelPage, media, mediaPage, intl, profile } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "main" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  intelPage: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
  mediaPage: {} as Record<string, unknown>,
  intl: { locale: "en" },
  profile: { nickname: "alice" as string | null },
}));

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages/en.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined),
      messages,
    );
  const useTranslations = (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const path = namespace === undefined ? key : `${namespace}.${key}`;
    const raw = lookup(path);
    let text = typeof raw === "string" ? raw : path;
    if (values) {
      text = Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
    }
    return text;
  };
  return {
    useTranslations,
    useLocale: () => intl.locale,
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});

/** A fresh copy on every call, so only a content comparison sees "no change". */
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => {
    const slots = Object.fromEntries(
      Object.entries(catalogue.slots).map(([slot, entries]) => [slot, entries.map((e) => ({ ...e }))]),
    );
    return {
      addons: {},
      catalogueDrive: catalogue.catalogueDrive,
      slots,
      loading: catalogue.loading,
      getSlotEntries: (id: string) => slots[id] ?? [],
      hasSlot: (id: string) => (slots[id] ?? []).length > 0,
    };
  },
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/addons/intelligence/slots.ts", () => ({ slotComponents: {}, slotProviders: intel, slotPageProviders: intelPage }));
vi.mock("@/addons/media_import/slots.ts", () => ({
  slotComponents: {},
  slotProviders: media,
  slotPageProviders: mediaPage,
}));
vi.mock("@/addons/knowledge/slots.ts", () => {
  throw new Error("module failed to load");
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: profile.nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
}));

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const addonsLinked = ["intelligence", "media_import", "knowledge"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

const DRIVE = "main";
const RECOMMENDED = enMessages.videoApp.shelves.recommended;

type Restrict = (ids: string[]) => Promise<string[]>;
type PageArgs = { drive: string; locale: string; limit: number; cursor: string | null; restrict: Restrict };
type PageAnswer = { items: unknown; cursor: unknown };
type PageProvider = (args: PageArgs) => Promise<PageAnswer>;

const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
const SHELF_PICKUP: Entry = { id: "pickup", label: "Shelf Pickup", priority: 10, addonName: "media_import" };

const TRIPS = {
  id: "sf-trips",
  drive: DRIVE,
  name: "Trips",
  query: "tag:Trip",
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "",
  updated_at: null,
};
const PICTURES = { ...TRIPS, id: "sf-pics", name: "Pictures", query: "", file_type: "image" };

let unmatched = new Set<string>();

function restrictAnswer(p: Params, drive = DRIVE) {
  const ids = (p.ids as string[]).filter((id) => !unmatched.has(id));
  const items = ids.map((id) => item(id, title(id), drive)).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

function groupingAnswer(p: Params) {
  const items = [item("g1", "Grouped one", DRIVE)];
  return { by: p.by, total_shelves: 1, base: "", shelves: [{ key: p.key, label: String(p.key), count: 1, items }] };
}

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** A provider that restricts `answer` and answers what was accepted, with the given cursor. */
function answering(answer: string[], cursor: unknown = null) {
  return vi.fn<PageProvider>(async ({ restrict }) => ({
    items: (await restrict(answer)).map((id) => ({ id })),
    cursor,
  }));
}


const viewerRequired = () => Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" });

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

async function nearEnd() {
  await act(async () => {
    for (const o of FakeObserver.instances) o.trigger();
  });
  await settle();
}

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

type PageProps = {
  drive?: string;
  entry?: string;
  slot?: string;
  by?: string | null;
  shelfKey?: string | null;
  from?: string | null;
};

/**
 * The page as the route renders it for `?entry=…&slot=…`. `by`, `shelfKey` and `from`
 * default to values the grouping mode would act on, so that entry mode is seen to ignore them.
 */
function pageElement({ drive = DRIVE, entry, slot, by = "folder", shelfKey = "Movies", from = "library" }: PageProps) {
  const props = {
    drive,
    by,
    shelfKey,
    from,
    ...(entry === undefined ? {} : { entry }),
    ...(slot === undefined ? {} : { slot }),
  } as unknown as Parameters<typeof VideoShelfPage>[0];
  return <VideoShelfPage {...props} />;
}

function renderPage(props: PageProps) {
  return render(pageElement(props));
}

const recommendedPage = (extra: PageProps = {}) => ({ entry: "pickup", slot: "recommended", ...extra });

function drawn(): string[] {
  return screen.queryAllByText(/^Vid [\w-]+$/).map((el) => el.textContent ?? "");
}

const skeleton = () => document.querySelector(".animate-pulse") !== null;
const heading = (name: string) => screen.queryByRole("heading", { name });
const retryButton = () => screen.queryByRole("button", { name: /retry/i });

beforeEach(() => {
  intl.locale = "en";
  profile.nickname = "alice";
  localStorage.clear();
  unmatched = new Set();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const bag of [intel, intelPage, media, mediaPage]) {
    for (const k of Object.keys(bag)) delete bag[k];
  }
  getShelves
    .mockReset()
    .mockImplementation(async (d: string, p: Params) => (p.ids !== undefined ? restrictAnswer(p, d) : groupingAnswer(p)));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 1 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-081 the shelf page in Recommended mode: drawing", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 resolves the entry among video-discover-recommended only, calls its page provider with cursor null, limit 60, the drive and locale, and is titled Recommended with no sort menu",
    async () => {
      intl.locale = "ja";
      const recommended = answering(["r2", "r1", "r3"]);
      const shelf = answering(["s1"]);
      intelPage.pickup = recommended;
      mediaPage.pickup = shelf;
      declare({ recommended: [PICKUP], shelves: [SHELF_PICKUP] });
      renderPage(recommendedPage());

      await screen.findByText(title("r2"));
      await settle();
      expect(drawn()).toEqual([title("r2"), title("r1"), title("r3")]);
      expect(recommended).toHaveBeenCalledTimes(1);
      expect(recommended.mock.calls[0][0]).toMatchObject({ drive: DRIVE, cursor: null, limit: 60, locale: "ja" });
      expect(shelf).not.toHaveBeenCalled();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(heading("Pickup")).not.toBeInTheDocument();
      expect(heading("Shelf Pickup")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Sort/ })).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 the first video-discover-recommended entry by priority with the id is the one used",
    async () => {
      const later = answering(["lo"]);
      const first = answering(["hi"]);
      intelPage.pickup = later;
      mediaPage.pickup = first;
      declare({
        recommended: [
          { ...PICKUP, priority: 30 },
          { id: "pickup", label: "Other pickup", priority: 5, addonName: "media_import" },
        ],
      });
      renderPage(recommendedPage());

      await screen.findByText(title("hi"));
      await settle();
      expect(later).not.toHaveBeenCalled();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I3 every restrict asks for unwatched videos under the app's target, at most 60 ids a request",
    async () => {
      getSmartFolders.mockResolvedValue([TRIPS]);
      writeAppPrefs(DRIVE, { target: "sf-trips" });
      const asked = ids("k", 300);
      intelPage.pickup = answering(asked);
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      await screen.findByText(title("k0"));
      const calls = restrictCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.length).toBeLessThanOrEqual(5);
      for (const p of calls) {
        expect(p).toMatchObject({ type: ["video"], watch: "unwatched" });
        expect([p.tag].flat()).toContain("Trip");
        expect((p.ids as string[]).length).toBeLessThanOrEqual(60);
      }
      expect(calls.flatMap((p) => p.ids as string[]).sort()).toEqual([...asked].sort());
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I10 every accepted item of one answer is drawn, however many more than the limit of 60 it holds",
    async () => {
      const many = ids("m", 300);
      const page = answering(many);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      await screen.findByText(title("m0"));
      await settle();
      expect(drawn()).toEqual(many.map(title));
      await nearEnd();
      await nearEnd();
      expect(page).toHaveBeenCalledTimes(1);
      expect(retryButton()).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I3 an id restrict refused, or never asked about, is not drawn, and repeats are dropped",
    async () => {
      unmatched = new Set(["r2"]);
      intelPage.pickup = vi.fn<PageProvider>(async ({ restrict }) => {
        const accepted = await restrict(["r1", "r2", "r3"]);
        return {
          items: [{ id: "r3" }, { id: "never-asked" }, { id: "r2" }, ...accepted.map((id) => ({ id })), { id: "r3" }],
          cursor: null,
        };
      });
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      await screen.findByText(title("r3"));
      await settle();
      expect(drawn()).toEqual([title("r3"), title("r1")]);
    },
  );
});

describe("SPEC-CORE-081 the shelf page in Recommended mode: the empty state and the title", () => {
  it.runIf(addonsLinked).each([
    ["an unknown entry", "nope", { recommended: [PICKUP] }],
    ["a list-only entry", "listed", { recommended: [{ id: "listed", label: "Listed", priority: 10, addonName: "intelligence" }] }],
    ["an entry whose module fails to import", "kn", { recommended: [{ id: "kn", label: "Knowledge", priority: 10, addonName: "knowledge" }] }],
    ["an entry of an addon not checked out", "gone", { recommended: [{ id: "gone", label: "Gone", priority: 10, addonName: "nope" }] }],
    ["an id found only among video-discover-shelves", "feed", { shelves: [{ id: "feed", label: "Feed", priority: 10, addonName: "media_import" }] }],
  ] as [string, string, { recommended?: Entry[]; shelves?: Entry[] }][])(
    "SPEC-CORE-081 I4 %s shows the empty state titled Recommended, and calls nothing",
    async (_name, entry, slots) => {
      const feed = answering(["v1"]);
      mediaPage.feed = feed;
      intelPage.pickup = feed;
      const listed = vi.fn(async () => ["v1"]);
      intel.listed = listed;
      declare(slots);
      renderPage(recommendedPage({ entry }));

      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      await settle();
      expect(feed).not.toHaveBeenCalled();
      expect(listed).not.toHaveBeenCalled();
      expect(restrictCalls()).toEqual([]);
      expect(retryButton()).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 a target that matches no video shows the empty state titled Recommended, and calls nothing",
    async () => {
      getSmartFolders.mockResolvedValue([PICTURES]);
      writeAppPrefs(DRIVE, { target: "sf-pics" });
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      await settle();
      expect(page).not.toHaveBeenCalled();
      expect(restrictCalls()).toEqual([]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 an answer with nothing restrict accepted ends in the empty state titled Recommended",
    async () => {
      unmatched = new Set(["v1", "v2"]);
      intelPage.pickup = answering(["v1", "v2"]);
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(retryButton()).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 while the catalogue loads, or was loaded for another drive, the skeleton shows under the Recommended title",
    async () => {
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      catalogue.loading = true;
      const view = renderPage(recommendedPage());
      await settle();
      expect(skeleton()).toBe(true);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(page).not.toHaveBeenCalled();

      catalogue.loading = false;
      catalogue.catalogueDrive = "other";
      view.rerender(pageElement(recommendedPage()));
      await settle();
      expect(skeleton()).toBe(true);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(page).not.toHaveBeenCalled();

      catalogue.catalogueDrive = DRIVE;
      view.rerender(pageElement(recommendedPage()));
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );
});

describe("SPEC-CORE-081 the shelf page in Recommended mode: the profile", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 without a profile, the skeleton shows while the catalogue loads, then the empty state titled Recommended, and no provider or restrict call",
    async () => {
      profile.nickname = null;
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      catalogue.loading = true;
      const view = renderPage(recommendedPage());
      await settle();
      expect(skeleton()).toBe(true);
      expect(screen.queryByText("No files")).not.toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();

      catalogue.loading = false;
      view.rerender(pageElement(recommendedPage()));
      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      await settle();
      expect(page).not.toHaveBeenCalled();
      expect(restrictCalls()).toEqual([]);
      expect(retryButton()).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 without a profile, a saved target still resolving shows the skeleton, never the empty state",
    async () => {
      profile.nickname = null;
      const folders = deferred<unknown[]>();
      getSmartFolders.mockReturnValue(folders.promise);
      writeAppPrefs(DRIVE, { target: "sf-trips" });
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());
      await settle();
      expect(skeleton()).toBe(true);
      expect(screen.queryByText("No files")).not.toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();

      await act(async () => folders.resolve([TRIPS]));
      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(page).not.toHaveBeenCalled();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 a viewer_required from restrict shows the empty state titled Recommended, never Retry, and nothing of that load",
    async () => {
      getShelves.mockImplementation(async (d: string, p: Params) => {
        if (p.ids !== undefined) throw viewerRequired();
        return groupingAnswer(p);
      });
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      await waitFor(() => expect(page).toHaveBeenCalled());
      expect(await screen.findByText("No files")).toBeInTheDocument();
      await settle();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(retryButton()).not.toBeInTheDocument();
      expect(drawn()).toEqual([]);
      expect(page).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 I9 a viewer_required on one restrict drops the load in flight, even when the provider answers with what an earlier restrict accepted",
    async () => {
      let restricts = 0;
      getShelves.mockImplementation(async (d: string, p: Params) => {
        if (p.ids === undefined) return groupingAnswer(p);
        restricts += 1;
        if (restricts === 2) throw viewerRequired();
        return restrictAnswer(p, d);
      });
      const page = vi.fn<PageProvider>(async ({ restrict }) => {
        const kept = await restrict(["v1"]);
        try {
          await restrict(["v2"]);
        } catch {
          // A provider may swallow its restrict's failure and answer what it has.
        }
        return { items: kept.map((id) => ({ id })), cursor: null };
      });
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());

      expect(await screen.findByText("No files")).toBeInTheDocument();
      await settle();
      expect(drawn()).toEqual([]);
      expect(retryButton()).not.toBeInTheDocument();
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );
});

describe("SPEC-CORE-081 the shelf page in Recommended mode: failures", () => {
  it.runIf(addonsLinked).each([
    ["the provider rejects", "reject"],
    ["its restrict fails with another error", "restrict"],
  ])("SPEC-CORE-081 when %s, Retry shows under the Recommended title and resends cursor null", async (_name, how) => {
    let first = true;
    const page = vi.fn<PageProvider>(async ({ restrict }) => {
      if (first && how === "reject") {
        first = false;
        throw new Error("boom");
      }
      return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: null };
    });
    if (how === "restrict") {
      let failed = false;
      getShelves.mockImplementation(async (d: string, p: Params) => {
        if (p.ids !== undefined && !failed) {
          failed = true;
          throw new ApiStatusError(500, "API error: 500");
        }
        return p.ids !== undefined ? restrictAnswer(p, d) : groupingAnswer(p);
      });
    }
    intelPage.pickup = page;
    declare({ recommended: [PICKUP] });
    renderPage(recommendedPage());

    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(heading(RECOMMENDED)).toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText(title("v1"))).toBeInTheDocument();
    expect(page).toHaveBeenCalledTimes(2);
    expect(page.mock.calls[1][0]).toMatchObject({ cursor: null, limit: 60 });
  });
});

describe("SPEC-CORE-081 I9 the shelf page in Recommended mode starts again", () => {
  type Change = { next: PageProps; change: () => void; drive?: string };

  it.runIf(addonsLinked).each([
    ["the nickname", { next: recommendedPage(), change: () => (profile.nickname = "bob") }],
    ["the UI locale", { next: recommendedPage(), change: () => (intl.locale = "ja") }],
    [
      "the drive",
      { next: recommendedPage({ drive: "other" }), change: () => (catalogue.catalogueDrive = "other"), drive: "other" },
    ],
    [
      "the video-discover-recommended entries",
      {
        next: recommendedPage(),
        change: () =>
          declare({ recommended: [PICKUP, { id: "daily", label: "Daily", priority: 20, addonName: "intelligence" }] }),
      },
    ],
  ] as [string, Change][])(
    "SPEC-CORE-081 I9 a change of %s restarts from cursor null with an empty grid, and never draws the old load's answer",
    async (_name, { next, change, drive }) => {
      const late = deferred<PageAnswer>();
      let call = 0;
      const page = vi.fn<PageProvider>(async ({ restrict }) => {
        call += 1;
        if (call === 1) {
          await restrict(["stale"]);
          return late.promise;
        }
        return { items: (await restrict(["fresh"])).map((id) => ({ id })), cursor: null };
      });
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      const view = renderPage(recommendedPage());
      await waitFor(() => expect(page).toHaveBeenCalledTimes(1));
      await settle();

      change();
      view.rerender(pageElement(next));
      expect(await screen.findByText(title("fresh"))).toBeInTheDocument();
      expect(page).toHaveBeenCalledTimes(2);
      expect(page.mock.calls[1][0]).toMatchObject({ cursor: null, limit: 60, locale: intl.locale, drive: drive ?? DRIVE });

      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([title("fresh")]);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I9 a change of entry restarts with the other video-discover-recommended entry's provider",
    async () => {
      const late = deferred<PageAnswer>();
      intelPage.pickup = vi.fn<PageProvider>(async ({ restrict }) => {
        await restrict(["stale"]);
        return late.promise;
      });
      const other = answering(["o1"]);
      intelPage.daily = other;
      declare({ recommended: [PICKUP, { id: "daily", label: "Daily", priority: 20, addonName: "intelligence" }] });
      const view = renderPage(recommendedPage());
      await waitFor(() => expect(intelPage.pickup).toHaveBeenCalledTimes(1));

      view.rerender(pageElement(recommendedPage({ entry: "daily" })));
      expect(await screen.findByText(title("o1"))).toBeInTheDocument();
      expect(other.mock.calls[0][0]).toMatchObject({ cursor: null, limit: 60 });
      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([title("o1")]);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I9 a change of target restarts, and an id the earlier load accepted does not count for the next",
    async () => {
      getSmartFolders.mockResolvedValue([TRIPS]);
      let call = 0;
      const page = vi.fn<PageProvider>(async ({ restrict }) => {
        call += 1;
        if (call === 1) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: null };
        const own = await restrict(["t1"]);
        return { items: [{ id: "v1" }, ...own.map((id) => ({ id }))], cursor: null };
      });
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      renderPage(recommendedPage());
      await screen.findByText(title("v1"));

      fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByText("Trips"));

      expect(await screen.findByText(title("t1"))).toBeInTheDocument();
      expect(page.mock.calls[1][0]).toMatchObject({ cursor: null });
      expect(drawn()).toEqual([title("t1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I4 I9 a profile cleared mid-load drops that load and shows the empty state, with no further call",
    async () => {
      const late = deferred<PageAnswer>();
      const page = vi.fn<PageProvider>(async ({ restrict }) => {
        await restrict(["stale"]);
        return late.promise;
      });
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      const view = renderPage(recommendedPage());
      await waitFor(() => expect(page).toHaveBeenCalledTimes(1));
      await settle();

      profile.nickname = null;
      view.rerender(pageElement(recommendedPage()));
      expect(await screen.findByText("No files")).toBeInTheDocument();

      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([]);
      expect(page).toHaveBeenCalledTimes(1);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I9 a profile set after the page opened without one starts the load from cursor null",
    async () => {
      profile.nickname = null;
      const page = answering(["v1"]);
      intelPage.pickup = page;
      declare({ recommended: [PICKUP] });
      const view = renderPage(recommendedPage());
      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(page).not.toHaveBeenCalled();

      profile.nickname = "alice";
      view.rerender(pageElement(recommendedPage()));
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(page).toHaveBeenCalledTimes(1);
      expect(page.mock.calls[0][0]).toMatchObject({ cursor: null });
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I9 a catalogue reload that changes only the video-discover-shelves entries does not restart",
    async () => {
      const page = answering(["v1"]);
      intelPage.pickup = page;
      mediaPage.feed = answering(["f1"]);
      declare({ recommended: [PICKUP], shelves: [{ id: "feed", label: "Feed", priority: 10, addonName: "media_import" }] });
      const view = renderPage(recommendedPage());
      await screen.findByText(title("v1"));

      declare({ recommended: [PICKUP], shelves: [{ id: "feed", label: "Feed renamed", priority: 20, addonName: "media_import" }] });
      view.rerender(pageElement(recommendedPage()));
      await settle();
      expect(page).toHaveBeenCalledTimes(1);
      expect(drawn()).toEqual([title("v1")]);
    },
  );
});

describe("SPEC-CORE-081 I9 switching between Recommended mode and plain entry mode", () => {
  it.runIf(addonsLinked).each([
    ["no slot", undefined],
    ["another slot", "shelves"],
  ])(
    "SPEC-CORE-081 I5 I9 from Recommended to %s, with the same entry, drops the load in flight and resolves video-discover-shelves with no watch condition",
    async (_name, plainSlot) => {
      const late = deferred<PageAnswer>();
      const recommended = vi.fn<PageProvider>(async ({ restrict }) => {
        await restrict(["stale"]);
        return late.promise;
      });
      const shelf = answering(["s1"]);
      intelPage.pickup = recommended;
      mediaPage.pickup = shelf;
      declare({ recommended: [PICKUP], shelves: [SHELF_PICKUP] });
      const view = renderPage(recommendedPage());
      await waitFor(() => expect(recommended).toHaveBeenCalledTimes(1));
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(restrictCalls().every((p) => p.watch === "unwatched")).toBe(true);
      const before = restrictCalls().length;

      view.rerender(pageElement({ entry: "pickup", slot: plainSlot }));
      expect(await screen.findByText(title("s1"))).toBeInTheDocument();
      expect(shelf.mock.calls[0][0]).toMatchObject({ cursor: null, limit: 60 });
      expect(heading("Shelf Pickup")).toBeInTheDocument();
      expect(restrictCalls().slice(before).every((p) => p.watch === undefined)).toBe(true);

      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([title("s1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I3 I9 from plain entry mode to Recommended, with the same entry, nothing accepted without watch=unwatched survives",
    async () => {
      const shelf = answering(["s1"]);
      const recommended = vi.fn<PageProvider>(async ({ restrict }) => {
        const own = await restrict(["r1"]);
        return { items: [{ id: "s1" }, ...own.map((id) => ({ id }))], cursor: null };
      });
      intelPage.pickup = recommended;
      mediaPage.pickup = shelf;
      declare({ recommended: [PICKUP], shelves: [SHELF_PICKUP] });
      const view = renderPage({ entry: "pickup" });
      await screen.findByText(title("s1"));
      expect(heading("Shelf Pickup")).toBeInTheDocument();

      view.rerender(pageElement(recommendedPage()));
      expect(await screen.findByText(title("r1"))).toBeInTheDocument();
      expect(recommended.mock.calls[0][0]).toMatchObject({ cursor: null, limit: 60 });
      await settle();
      expect(drawn()).toEqual([title("r1")]);
      expect(heading(RECOMMENDED)).toBeInTheDocument();
      expect(shelf).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I5 slot without entry is ignored: from Recommended mode, dropping entry gives the grouping page with its sort menu",
    async () => {
      intelPage.pickup = answering(["r1"]);
      declare({ recommended: [PICKUP] });
      const view = renderPage(recommendedPage());
      await screen.findByText(title("r1"));

      view.rerender(pageElement({ slot: "recommended" }));
      expect(await screen.findByText("Grouped one")).toBeInTheDocument();
      expect(screen.queryByText(title("r1"))).not.toBeInTheDocument();
      expect(heading("Movies")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Sort/ })).toBeInTheDocument();
    },
  );
});
