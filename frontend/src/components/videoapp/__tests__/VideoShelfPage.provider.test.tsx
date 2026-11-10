/**
 * SPEC-CORE-078 / SPEC-CORE-079: the shelf page in `entry` mode pages through an addon's
 * `slotPageProviders[entry]` by cursor, 60 at a time, under the app's target.
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

import { writeAppPrefs } from "@/lib/appPrefs";
import enMessages from "@/messages/en.json";
import { VideoShelfPage } from "../VideoShelfPage";
import { deferred, item, title, type Entry, type Params } from "./discoverHarness";

const { catalogue, intelPage, media, mediaPage, intl } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "main" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intelPage: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
  mediaPage: {} as Record<string, unknown>,
  intl: { locale: "en" },
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

vi.mock("@/addons/intelligence/slots.ts", () => ({ slotComponents: {}, slotProviders: {}, slotPageProviders: intelPage }));
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
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
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
const APP_TITLE = enMessages.videoApp.title;

type Restrict = (ids: string[]) => Promise<string[]>;
type PageArgs = { drive: string; locale: string; limit: number; cursor: string | null; restrict: Restrict };
type PageAnswer = { items: unknown; cursor: unknown };
type PageProvider = (args: PageArgs) => Promise<PageAnswer>;

const FEED: Entry = { id: "feed", label: "Feed", priority: 10, addonName: "media_import" };

let unmatched = new Set<string>();

function restrictAnswer(p: Params) {
  const ids = (p.ids as string[]).filter((id) => !unmatched.has(id));
  const items = ids.map((id) => item(id, title(id), DRIVE)).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

function groupingAnswer(p: Params) {
  const items = [item("g1", "Grouped one", DRIVE)];
  return { by: p.by, total_shelves: 1, base: "", shelves: [{ key: p.key, label: String(p.key), count: 1, items }] };
}

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);
const groupingCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids === undefined);

function shelves(entries: Entry[]) {
  catalogue.slots = { "video-discover-shelves": entries };
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

type Page = { ids: string[]; cursor: unknown; bylines?: Record<string, unknown> };

/** A provider that answers each cursor from `pages` (keyed by the cursor, "" for null), restricting what it answers. */
function pager(pages: Record<string, Page>) {
  return vi.fn<PageProvider>(async ({ cursor, restrict }) => {
    const page = pages[cursor ?? ""];
    if (!page) throw new Error(`no page for ${String(cursor)}`);
    const accepted = await restrict(page.ids);
    return {
      items: accepted.map((id) => (page.bylines && id in page.bylines ? { id, byline: page.bylines[id] } : { id })),
      cursor: page.cursor,
    };
  });
}

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

/** Fires every live near-end sentinel. */
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

type PageProps = { drive?: string; entry?: string; by?: string | null; shelfKey?: string | null; from?: string | null };

/**
 * The entry mode, rendered as the route renders it for `?entry=`. `by`, `shelfKey` and `from`
 * default to values the grouping mode would act on, so that entry mode is seen to ignore them.
 */
function pageElement({ drive = DRIVE, entry, by = "folder", shelfKey = "Movies", from = "library" }: PageProps) {
  const props = { drive, by, shelfKey, from, ...(entry === undefined ? {} : { entry }) } as unknown as Parameters<
    typeof VideoShelfPage
  >[0];
  return <VideoShelfPage {...props} />;
}

function renderEntryPage(props: PageProps) {
  return render(pageElement(props));
}

/** Video titles drawn on the page, in document order. */
function drawn(): string[] {
  return screen.queryAllByText(/^Vid [\w-]+$/).map((el) => el.textContent ?? "");
}

/** A card's element tree as tag and class, so cards of different videos compare by structure alone. */
function shape(el: Element | null | undefined): string[] {
  return el ? [...el.querySelectorAll("*")].map((e) => `${e.tagName}.${e.getAttribute("class") ?? ""}`) : [];
}

const BYLINE = ".mt-0\\.5.block.truncate.text-xs.text-text-muted";

const skeleton = () => document.querySelector(".animate-pulse") !== null;
const heading = (name: string) => screen.queryByRole("heading", { name });

beforeEach(() => {
  intl.locale = "en";
  localStorage.clear();
  unmatched = new Set();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const bag of [intelPage, media, mediaPage]) {
    for (const k of Object.keys(bag)) delete bag[k];
  }
  getShelves.mockReset().mockImplementation(async (_d, p: Params) => (p.ids !== undefined ? restrictAnswer(p) : groupingAnswer(p)));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 1 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-078 the provider shelf page: the first page", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I10 I12 the first call carries cursor null, limit 60, the drive and the locale; the grid keeps the provider's order; by/key/from are ignored",
    async () => {
      intl.locale = "ja";
      const feed = pager({ "": { ids: ["v3", "v1", "v2"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      await screen.findByText(title("v3"));
      expect(drawn()).toEqual([title("v3"), title("v1"), title("v2")]);
      expect(feed).toHaveBeenCalledTimes(1);
      const args = feed.mock.calls[0][0];
      expect(args).toMatchObject({ drive: DRIVE, cursor: null, limit: 60, locale: "ja" });
      expect(groupingCalls()).toEqual([]);
      expect(screen.queryByText("Grouped one")).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I12 the title is the entry's translated label, else its label, and there is no sort menu",
    async () => {
      mediaPage.feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.lane = pager({ "": { ids: ["w1"], cursor: null } });
      shelves([FEED, { id: "lane", label: "Untranslated", priority: 20, addonName: "media_import", i18n_key: "mediaImport.slots.videoRegular" }]);
      const view = renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));
      expect(heading("Feed")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Sort/ })).not.toBeInTheDocument();
      view.unmount();

      renderEntryPage({ entry: "lane" });
      await screen.findByText(title("w1"));
      expect(heading("Regular sources")).toBeInTheDocument();
      expect(heading("Untranslated")).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)("SPEC-CORE-078 I3 a page is not cut at the limit", async () => {
    const many = ids("m", 70);
    mediaPage.feed = pager({ "": { ids: many, cursor: null } });
    shelves([FEED]);
    renderEntryPage({ entry: "feed" });

    await screen.findByText(title("m0"));
    await settle();
    expect(drawn()).toEqual(many.map(title));
  });

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I2 I3 ids restrict never accepted and duplicates are dropped",
    async () => {
      unmatched = new Set(["v2"]);
      mediaPage.feed = vi.fn<PageProvider>(async ({ restrict }) => {
        const accepted = await restrict(["v1", "v2", "v3"]);
        return {
          items: [{ id: "v3" }, { id: "never-asked" }, { id: "v2" }, { id: "v1" }, { id: "v3" }, ...accepted.map((id) => ({ id }))],
          cursor: null,
        };
      });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      await screen.findByText(title("v3"));
      await settle();
      expect(drawn()).toEqual([title("v3"), title("v1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 an item whose id is not a non-empty string is dropped",
    async () => {
      mediaPage.feed = vi.fn<PageProvider>(async ({ restrict }) => {
        await restrict(["v1"]);
        return { items: [{ id: 1 }, { id: "" }, {}, { id: "v1" }], cursor: null };
      });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      await screen.findByText(title("v1"));
      await settle();
      expect(drawn()).toEqual([title("v1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I2 restrict asks under the app's target with no watch condition, at most 60 ids a request and ceil(n/60) requests",
    async () => {
      getSmartFolders.mockResolvedValue([
        { id: "sf-trips", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
      ]);
      writeAppPrefs(DRIVE, { target: "sf-trips" });
      const asked = ids("k", 121);
      mediaPage.feed = pager({ "": { ids: asked, cursor: null } });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      await screen.findByText(title("k0"));
      const calls = restrictCalls();
      expect(calls.length).toBeLessThanOrEqual(3);
      for (const p of calls) {
        expect(p).toMatchObject({ type: ["video"] });
        expect(p.watch).toBeUndefined();
        expect([p.tag].flat()).toContain("Trip");
        expect((p.ids as string[]).length).toBeLessThanOrEqual(60);
      }
      expect(calls.flatMap((p) => p.ids as string[]).sort()).toEqual([...asked].sort());
    },
  );
});

describe("SPEC-CORE-078 the provider shelf page: further pages", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I4 near the end it calls again with exactly the returned cursor and limit 60, and appends",
    async () => {
      const feed = pager({
        "": { ids: ["v1", "v2"], cursor: "opaque:/?&= 1" },
        "opaque:/?&= 1": { ids: ["v3"], cursor: "c2" },
        c2: { ids: ["v4"], cursor: null },
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v2"));

      await nearEnd();
      await screen.findByText(title("v3"));
      expect(feed.mock.calls[1][0]).toMatchObject({ cursor: "opaque:/?&= 1", limit: 60, drive: DRIVE, locale: "en" });
      expect(drawn()).toEqual([title("v1"), title("v2"), title("v3")]);

      await nearEnd();
      await screen.findByText(title("v4"));
      expect(feed.mock.calls[2][0]).toMatchObject({ cursor: "c2", limit: 60 });
      expect(drawn()).toEqual([title("v1"), title("v2"), title("v3"), title("v4")]);

      await nearEnd();
      await nearEnd();
      expect(feed).toHaveBeenCalledTimes(3);
    },
  );

  it.runIf(addonsLinked).each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a number", 5],
    ["an object", { next: "c2" }],
  ])("SPEC-CORE-078 I4 a cursor that is %s ends the list", async (_name, cursor) => {
    const feed = pager({ "": { ids: ["v1"], cursor } });
    mediaPage.feed = feed;
    shelves([FEED]);
    renderEntryPage({ entry: "feed" });
    await screen.findByText(title("v1"));

    await nearEnd();
    await nearEnd();
    expect(feed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I3 I4 duplicates of earlier pages are dropped, and a page that adds nothing new ends the list whatever its cursor",
    async () => {
      const feed = pager({
        "": { ids: ["v1", "v2"], cursor: "c1" },
        c1: { ids: ["v2", "v3", "v1"], cursor: "c2" },
        c2: { ids: ["v3", "v1"], cursor: "c3" },
        c3: { ids: ["v9"], cursor: null },
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      await nearEnd();
      await screen.findByText(title("v3"));
      expect(drawn()).toEqual([title("v1"), title("v2"), title("v3")]);

      await nearEnd();
      await waitFor(() => expect(feed).toHaveBeenCalledTimes(3));
      await nearEnd();
      await nearEnd();
      expect(feed).toHaveBeenCalledTimes(3);
      expect(drawn()).toEqual([title("v1"), title("v2"), title("v3")]);
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 a provider that repeats its cursor stops after the page that adds nothing",
    async () => {
      const feed = vi.fn<PageProvider>(async ({ restrict }) => ({
        items: (await restrict(["v1"])).map((id) => ({ id })),
        cursor: "same",
      }));
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      for (let i = 0; i < 4; i++) await nearEnd();
      expect(feed).toHaveBeenCalledTimes(2);
      expect(drawn()).toEqual([title("v1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 a first page that adds nothing ends with the empty state, even with a cursor",
    async () => {
      unmatched = new Set(["v1"]);
      const feed = pager({ "": { ids: ["v1"], cursor: "c1" }, c1: { ids: ["v2"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      expect(await screen.findByText("No files")).toBeInTheDocument();
      await nearEnd();
      await nearEnd();
      expect(feed).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I9 a rejected later page keeps the drawn items, and its Retry resends the same cursor",
    async () => {
      let failNext = true;
      const feed = vi.fn<PageProvider>(async ({ cursor, restrict }) => {
        if (cursor === null) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: "c1" };
        if (failNext) {
          failNext = false;
          throw new Error("boom");
        }
        return { items: (await restrict(["v2"])).map((id) => ({ id })), cursor: null };
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      await nearEnd();
      const retry = await screen.findByRole("button", { name: /retry/i });
      expect(drawn()).toEqual([title("v1")]);

      fireEvent.click(retry);
      await screen.findByText(title("v2"));
      expect(feed).toHaveBeenCalledTimes(3);
      expect(feed.mock.calls[2][0]).toMatchObject({ cursor: "c1", limit: 60 });
      expect(drawn()).toEqual([title("v1"), title("v2")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I9 a rejected later page that comes from a malformed answer also offers Retry",
    async () => {
      let call = 0;
      mediaPage.feed = vi.fn<PageProvider>(async ({ restrict }) => {
        call += 1;
        if (call === 1) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: "c1" };
        return { items: "v2", cursor: null };
      });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      await nearEnd();
      expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
      expect(drawn()).toEqual([title("v1")]);
    },
  );
});

describe("SPEC-CORE-078 the provider shelf page: failures", () => {
  it.runIf(addonsLinked).each([
    ["the provider rejects", "reject"],
    ["items is not an array", "malformed"],
    ["its restrict fails", "restrict"],
  ])("SPEC-CORE-078 I9 when %s on the first page, Retry shows, and it resends cursor null", async (_name, how) => {
    let first = true;
    const feed = vi.fn<PageProvider>(async ({ restrict }) => {
      if (first) {
        first = false;
        if (how === "reject") throw new Error("boom");
        if (how === "malformed") return { items: null, cursor: null };
        await restrict(["v1"]);
      }
      return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: null };
    });
    if (how === "restrict") {
      let failed = false;
      getShelves.mockImplementation(async (_d, p: Params) => {
        if (p.ids !== undefined && !failed) {
          failed = true;
          throw new Error("restrict failed");
        }
        return p.ids !== undefined ? restrictAnswer(p) : groupingAnswer(p);
      });
    }
    mediaPage.feed = feed;
    shelves([FEED]);
    renderEntryPage({ entry: "feed" });

    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText(title("v1"))).toBeInTheDocument();
    expect(feed).toHaveBeenCalledTimes(2);
    expect(feed.mock.calls[1][0]).toMatchObject({ cursor: null, limit: 60 });
  });

  it.runIf(addonsLinked).each([
    ["an unknown entry", "nope", [FEED]],
    ["a list-only entry", "listed", [{ id: "listed", label: "Listed", priority: 10, addonName: "media_import" }]],
    ["an entry whose module fails to import", "kn", [{ id: "kn", label: "Knowledge shelf", priority: 10, addonName: "knowledge" }]],
    ["an entry of an addon not checked out", "gone", [{ id: "gone", label: "Gone", priority: 10, addonName: "nope" }]],
    ["an entry of another slot", "pickup", []],
  ] as [string, string, Entry[]][])(
    "SPEC-CORE-078 I9 %s shows the empty state titled with the app's name, and calls nothing",
    async (_name, entry, entries) => {
      const feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.feed = feed;
      const listed = vi.fn(async () => ["v1"]);
      media.listed = listed;
      intelPage.pickup = feed;
      catalogue.slots = {
        "video-discover-shelves": entries,
        "video-discover-recommended": [{ id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" }],
      };
      renderEntryPage({ entry });

      expect(await screen.findByText("No files")).toBeInTheDocument();
      expect(heading(APP_TITLE)).toBeInTheDocument();
      await settle();
      expect(feed).not.toHaveBeenCalled();
      expect(listed).not.toHaveBeenCalled();
      expect(restrictCalls()).toEqual([]);
      expect(groupingCalls()).toEqual([]);
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 the first entry by priority with the id is the one used",
    async () => {
      const low = pager({ "": { ids: ["lo"], cursor: null } });
      const high = pager({ "": { ids: ["hi"], cursor: null } });
      intelPage.feed = low;
      mediaPage.feed = high;
      shelves([
        { id: "feed", label: "Later", priority: 30, addonName: "intelligence" },
        { id: "feed", label: "First", priority: 5, addonName: "media_import" },
      ]);
      renderEntryPage({ entry: "feed" });

      await screen.findByText(title("hi"));
      await settle();
      expect(low).not.toHaveBeenCalled();
      expect(heading("First")).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I7 the byline of an item is drawn as text, not as markup",
    async () => {
      mediaPage.feed = pager({ "": { ids: ["v1"], cursor: null, bylines: { v1: "<i>x</i>" } } });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      expect(await screen.findByText("<i>x</i>")).toBeInTheDocument();
      expect(screen.getByText(title("v1")).closest("li")?.querySelector("i")).toBeNull();
    },
  );
});

describe("SPEC-CORE-078 the provider shelf page: waiting", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I10 while the catalogue loads, or was loaded for another drive, it shows the skeleton and calls nothing",
    async () => {
      const feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      catalogue.loading = true;
      const view = renderEntryPage({ entry: "feed" });
      await settle();
      expect(skeleton()).toBe(true);
      expect(screen.queryByText("No files")).not.toBeInTheDocument();
      expect(feed).not.toHaveBeenCalled();

      catalogue.loading = false;
      catalogue.catalogueDrive = "other";
      view.rerender(pageElement({ entry: "feed" }));
      await settle();
      expect(skeleton()).toBe(true);
      expect(screen.queryByText("No files")).not.toBeInTheDocument();
      expect(feed).not.toHaveBeenCalled();
      expect(heading(APP_TITLE)).toBeInTheDocument();

      catalogue.catalogueDrive = DRIVE;
      view.rerender(pageElement({ entry: "feed" }));
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(feed).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I10 while a saved smart folder is resolving, it shows the skeleton and calls nothing",
    async () => {
      const folders = deferred<unknown[]>();
      getSmartFolders.mockReturnValue(folders.promise);
      writeAppPrefs(DRIVE, { target: "sf-trips" });
      const feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await settle();
      expect(skeleton()).toBe(true);
      expect(screen.queryByText("No files")).not.toBeInTheDocument();
      expect(feed).not.toHaveBeenCalled();

      await act(async () =>
        folders.resolve([
          { id: "sf-trips", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
        ]),
      );
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(feed).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I10 a target that matches no video shows the empty state and calls nothing",
    async () => {
      getSmartFolders.mockResolvedValue([
        { id: "sf-pics", drive: DRIVE, name: "Pictures", query: "", file_type: "image", sort_by: null, sort_order: null, created_at: "", updated_at: null },
        { id: "sf-trips", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
      ]);
      writeAppPrefs(DRIVE, { target: "sf-pics" });
      const feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      expect(await screen.findByText("No files")).toBeInTheDocument();
      await settle();
      expect(feed).not.toHaveBeenCalled();
      expect(restrictCalls()).toEqual([]);

      fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByText("Trips"));
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(feed).toHaveBeenCalledTimes(1);
    },
  );
});

describe("SPEC-CORE-078 I8 the provider shelf page starts again", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I8 a target change restarts from cursor null with an empty grid, and never draws the old load's answer",
    async () => {
      getSmartFolders.mockResolvedValue([
        { id: "sf-trips", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
      ]);
      const late = deferred<PageAnswer>();
      let call = 0;
      const feed = vi.fn<PageProvider>(async ({ cursor, restrict }) => {
        call += 1;
        if (call === 1) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: "c1" };
        if (call === 2) {
          await restrict(["stale"]);
          return late.promise;
        }
        return { items: (await restrict(["t1"])).map((id) => ({ id })), cursor: cursor === null ? null : "x" };
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      await nearEnd();
      await waitFor(() => expect(call).toBe(2));

      fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByText("Trips"));

      expect(await screen.findByText(title("t1"))).toBeInTheDocument();
      expect(feed.mock.calls[2][0]).toMatchObject({ cursor: null, limit: 60 });
      expect(screen.queryByText(title("v1"))).not.toBeInTheDocument();

      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([title("t1")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I2 I8 an id accepted by an earlier load's restrict does not count for the next one",
    async () => {
      getSmartFolders.mockResolvedValue([
        { id: "sf-trips", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
      ]);
      let call = 0;
      const feed = vi.fn<PageProvider>(async ({ restrict }) => {
        call += 1;
        if (call === 1) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: null };
        const own = await restrict(["t1"]);
        return { items: [{ id: "v1" }, ...own.map((id) => ({ id }))], cursor: null };
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByText("Trips"));

      expect(await screen.findByText(title("t1"))).toBeInTheDocument();
      expect(drawn()).toEqual([title("t1")]);
    },
  );

  it.runIf(addonsLinked).each([
    ["the entry", { entry: "other" }, () => {}],
    ["the UI locale", { entry: "feed" }, () => (intl.locale = "ja")],
  ] as [string, PageProps, () => void][])(
    "SPEC-CORE-078 I8 a change of %s restarts from cursor null and never draws the old load's answer",
    async (_name, next, change) => {
      const late = deferred<PageAnswer>();
      let feedCall = 0;
      const feed = vi.fn<PageProvider>(async ({ restrict, locale }) => {
        feedCall += 1;
        if (feedCall === 1) {
          await restrict(["stale"]);
          return late.promise;
        }
        return { items: (await restrict([`f-${locale}`])).map((id) => ({ id })), cursor: null };
      });
      const other = pager({ "": { ids: ["o1"], cursor: null } });
      mediaPage.feed = feed;
      mediaPage.other = other;
      shelves([FEED, { id: "other", label: "Other", priority: 20, addonName: "media_import" }]);
      const view = renderEntryPage({ entry: "feed" });
      await waitFor(() => expect(feed).toHaveBeenCalledTimes(1));

      change();
      view.rerender(pageElement(next));
      const fresh = next.entry === "other" ? title("o1") : title("f-ja");
      expect(await screen.findByText(fresh)).toBeInTheDocument();
      const calls = next.entry === "other" ? other.mock.calls : feed.mock.calls.slice(1);
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({ cursor: null, limit: 60, locale: intl.locale });

      await act(async () => late.resolve({ items: [{ id: "stale" }], cursor: null }));
      await settle();
      expect(drawn()).toEqual([fresh]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I8 a catalogue reload with the same entries does not restart, and one that changes them does",
    async () => {
      const feed = pager({ "": { ids: ["v1"], cursor: null } });
      mediaPage.feed = feed;
      shelves([FEED]);
      const view = renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));

      view.rerender(pageElement({ entry: "feed" }));
      await settle();
      expect(feed).toHaveBeenCalledTimes(1);

      shelves([{ ...FEED, label: "Feed", i18n_key: "mediaImport.slots.videoRegular" }]);
      view.rerender(pageElement({ entry: "feed" }));
      await waitFor(() => expect(feed).toHaveBeenCalledTimes(2));
      expect(feed.mock.calls[1][0]).toMatchObject({ cursor: null });
      expect(await screen.findByText(title("v1"))).toBeInTheDocument();
      expect(heading("Regular sources")).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I1 I8 switching to grouping mode drops the provider's grid and draws the grouping shelf with its sort menu",
    async () => {
      const late = deferred<PageAnswer>();
      let call = 0;
      const feed = vi.fn<PageProvider>(async ({ restrict }) => {
        call += 1;
        if (call === 1) return { items: (await restrict(["v1"])).map((id) => ({ id })), cursor: "c1" };
        await restrict(["v2"]);
        return late.promise;
      });
      mediaPage.feed = feed;
      shelves([FEED]);
      const view = renderEntryPage({ entry: "feed" });
      await screen.findByText(title("v1"));
      await nearEnd();
      await waitFor(() => expect(call).toBe(2));

      view.rerender(pageElement({ entry: undefined }));
      expect(await screen.findByText("Grouped one")).toBeInTheDocument();
      expect(screen.queryByText(title("v1"))).not.toBeInTheDocument();
      expect(heading("Movies")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Sort/ })).toBeInTheDocument();

      await act(async () => late.resolve({ items: [{ id: "v2" }], cursor: null }));
      await settle();
      expect(screen.queryByText(title("v2"))).not.toBeInTheDocument();
    },
  );
});

describe("SPEC-CORE-079 bylines on the provider shelf page", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I7 each card shows its own byline as one muted truncated line under the clamped title, on every page",
    async () => {
      mediaPage.feed = pager({
        "": { ids: ["v1", "v2"], cursor: "c1", bylines: { v1: "Channel One · Nov 1", v2: "" } },
        c1: { ids: ["v3", "v4"], cursor: null, bylines: { v3: "Channel Three · Nov 3", v4: 7 } },
      });
      shelves([FEED]);
      renderEntryPage({ entry: "feed" });

      const one = await screen.findByText("Channel One · Nov 1");
      expect(one).toHaveClass("mt-0.5", "block", "truncate", "text-xs", "text-text-muted");
      const v1 = screen.getByText(title("v1"));
      expect(v1.closest("li")?.contains(one)).toBe(true);
      expect(v1.closest(".line-clamp-2")).not.toBeNull();
      expect(v1.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText(title("v2")).closest("li")?.querySelector(BYLINE)).toBeNull();

      await nearEnd();
      const three = await screen.findByText("Channel Three · Nov 3");
      expect(screen.getByText(title("v3")).closest("li")?.contains(three)).toBe(true);
      expect(screen.queryByText("7")).not.toBeInTheDocument();
      expect(shape(screen.getByText(title("v4")).closest("li"))).toEqual(shape(screen.getByText(title("v2")).closest("li")));
      expect(shape(screen.getByText(title("v3")).closest("li"))).not.toEqual(shape(screen.getByText(title("v2")).closest("li")));
    },
  );
});
