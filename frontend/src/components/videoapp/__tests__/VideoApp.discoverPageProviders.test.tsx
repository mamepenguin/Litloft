/**
 * SPEC-CORE-078 / SPEC-CORE-079 on Discover: a `video-discover-shelves` entry whose addon
 * exports `slotPageProviders[entry.id]` is drawn from that provider's first page, carries the
 * items' bylines, and links its See all to the core provider shelf page.
 *
 * The addon modules are stubbed under their real ids because the slot loader resolves
 * `@/addons/<name>/slots.ts` by globbing the linked directory.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { resetDiscoverCache } from "../discoverCache";
import { VideoApp } from "../VideoApp";
import { deferred, item, title, type Entry, type Params, type Provider } from "./discoverHarness";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

const { catalogue, intel, intelPage, media, mediaPage, intl } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "my drive" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  intelPage: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
  mediaPage: {} as Record<string, unknown>,
  intl: { locale: "en" },
}));

// The UI locale is switched per case, so this file replaces the shared next-intl stub with
// one whose `useLocale` follows `intl.locale`.
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

vi.mock("@/addons/intelligence/slots.ts", () => ({
  slotComponents: {},
  slotProviders: intel,
  slotPageProviders: intelPage,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({
  slotComponents: {},
  slotProviders: media,
  slotPageProviders: mediaPage,
}));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/my%20drive/apps/video",
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

type Restrict = (ids: string[]) => Promise<string[]>;
type PageArgs = { drive: string; locale: string; limit: number; cursor: string | null; restrict: Restrict };
type PageAnswer = { items: unknown; cursor: unknown };
type PageProvider = (args: PageArgs) => Promise<PageAnswer>;

let DRIVE = "my drive";
let drives = 0;
let unmatched = new Set<string>();

function restrictAnswer(p: Params) {
  const ids = (p.ids as string[]).filter((id) => !unmatched.has(id));
  const items = ids.map((id) => item(id, title(id), DRIVE)).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

function defaultShelves(_d: string, p: Params) {
  if (p.ids !== undefined) return restrictAnswer(p);
  if (p.by === "watch" && p.key === "continue") {
    return {
      by: "watch",
      total_shelves: 1,
      base: "",
      shelves: [{ key: "continue", label: "", count: 1, items: [item("c1", "Resume me", DRIVE)] }],
    };
  }
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);

const SHELF_A: Entry = {
  id: "shelf-a",
  label: "Shelf Alpha",
  priority: 10,
  addonName: "media_import",
  href: "addons/media_import",
};
const SHELF_B: Entry = { id: "shelf-b", label: "Shelf Beta", priority: 20, addonName: "media_import" };
const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

/** A page provider that restricts `ids` and answers them with the given bylines and cursor. */
function paging(ids: string[], bylines: Record<string, unknown> = {}, cursor: unknown = "next-1") {
  return vi.fn<PageProvider>(async ({ restrict }) => {
    const accepted = await restrict(ids);
    return {
      items: accepted.map((id) => (id in bylines ? { id, byline: bylines[id] } : { id })),
      cursor,
    };
  });
}

function restricting(ids: string[]) {
  return vi.fn<Provider>(async ({ restrict }) => restrict(ids));
}

const silentPage = () => vi.fn<PageProvider>(() => new Promise<PageAnswer>(() => {}));

/** The `li` card holding the given video title. */
/** A card's element tree as tag and class, so cards of different videos compare by structure alone. */
function shape(el: Element): string[] {
  return [...el.querySelectorAll("*")].map((e) => `${e.tagName}.${e.getAttribute("class") ?? ""}`);
}

const BYLINE = ".mt-1.block.truncate.text-sm.text-text-muted";

function card(videoTitle: string): HTMLElement {
  const li = screen.getByText(videoTitle).closest("li");
  if (!li) throw new Error(`no card for ${videoTitle}`);
  return li as HTMLElement;
}

function shelfSection(heading: string): HTMLElement | undefined {
  return [...document.querySelectorAll("section")].find(
    (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
  ) as HTMLElement | undefined;
}

function cardsIn(heading: string): string[] {
  const section = shelfSection(heading);
  if (!section) return [];
  return [...section.querySelectorAll("li")]
    .map((li) => li.textContent?.match(/Vid [\w-]+/)?.[0] ?? "")
    .filter(Boolean);
}

function seeAll(heading: string) {
  return screen.queryByRole("link", { name: `See all: ${heading}` })?.getAttribute("href") ?? null;
}

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function freshDrive() {
  drives += 1;
  return `my drive ${drives}`;
}

function renderApp() {
  return render(<VideoApp drive={DRIVE} />);
}

beforeEach(() => {
  DRIVE = freshDrive();
  intl.locale = "en";
  localStorage.clear();
  resetDiscoverCache();
  unmatched = new Set();
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const bag of [intel, intelPage, media, mediaPage]) {
    for (const k of Object.keys(bag)) delete bag[k];
  }
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => ({
    data: [item("n1", "Newest one", DRIVE)],
    meta: { total: 1, page: 1, limit: 12 },
  }));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("SPEC-CORE-078 which provider draws an addon shelf", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I6 a shelves entry with a page provider is drawn from its first page (cursor null, limit 12, the UI locale), and its list provider is not called",
    async () => {
      intl.locale = "ja";
      const page = paging(["a2", "a1"]);
      const list = restricting(["l1"]);
      mediaPage["shelf-a"] = page;
      media["shelf-a"] = list;
      declare({ shelves: [SHELF_A] });
      renderApp();

      await screen.findByText(title("a2"));
      await settle();
      expect(cardsIn("Shelf Alpha")).toEqual([title("a2"), title("a1")]);
      expect(list).not.toHaveBeenCalled();
      expect(screen.queryByText(title("l1"))).not.toBeInTheDocument();
      expect(page).toHaveBeenCalledTimes(1);
      const args = page.mock.calls[0][0];
      expect(args.drive).toBe(DRIVE);
      expect(args.cursor).toBeNull();
      expect(args.limit).toBe(12);
      expect(args.locale).toBe("ja");
      expect(typeof args.restrict).toBe("function");
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I6 Recommended never uses a page provider, and list providers receive no locale",
    async () => {
      const recommendedPage = paging(["rp"]);
      const recommendedList = restricting(["r1"]);
      intelPage.pickup = recommendedPage;
      intel.pickup = recommendedList;
      const shelfPage = paging(["a1"]);
      mediaPage["shelf-a"] = shelfPage;
      const shelfList = restricting(["b1"]);
      media["shelf-b"] = shelfList;
      declare({ recommended: [PICKUP], shelves: [SHELF_A, SHELF_B] });
      renderApp();

      await screen.findByText(title("r1"));
      await screen.findByText(title("a1"));
      await screen.findByText(title("b1"));
      expect(recommendedPage).not.toHaveBeenCalled();
      expect(screen.queryByText(title("rp"))).not.toBeInTheDocument();
      expect(shelfPage).toHaveBeenCalledTimes(1);
      expect(recommendedList.mock.calls[0][0]).not.toHaveProperty("locale");
      expect(shelfList.mock.calls[0][0]).not.toHaveProperty("locale");
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 a Recommended entry with only a page provider draws no Recommended",
    async () => {
      const recommendedPage = paging(["rp"]);
      intelPage.pickup = recommendedPage;
      mediaPage["shelf-a"] = paging(["a1"]);
      declare({ recommended: [PICKUP], shelves: [SHELF_A] });
      renderApp();

      await screen.findByText(title("a1"));
      await settle();
      expect(recommendedPage).not.toHaveBeenCalled();
      expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 the first page builds the shelf as a list does: provider order, no duplicates, only restricted ids, at most 12, and its cursor is not followed",
    async () => {
      const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
      unmatched = new Set(["a3"]);
      const page = vi.fn<PageProvider>(async ({ restrict }) => {
        const accepted = await restrict(ids);
        return {
          items: [{ id: accepted[0] }, { id: "zz" }, { id: accepted[0] }, ...accepted.map((id) => ({ id })), { id: "a3" }],
          cursor: "more",
        };
      });
      mediaPage["shelf-a"] = page;
      declare({ shelves: [SHELF_A] });
      renderApp();

      await screen.findByText(title("a0"));
      await settle();
      expect(cardsIn("Shelf Alpha")).toEqual(ids.filter((id) => id !== "a3").slice(0, 12).map(title));
      expect(page).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 an item whose id is not a non-empty string is dropped",
    async () => {
      mediaPage["shelf-a"] = vi.fn<PageProvider>(async ({ restrict }) => {
        const accepted = await restrict(["a1", "a2"]);
        return { items: [{ id: 7 }, { id: "" }, { byline: "x" }, { id: accepted[0] }, { id: accepted[1] }], cursor: null };
      });
      declare({ shelves: [SHELF_A] });
      renderApp();

      await screen.findByText(title("a1"));
      await settle();
      expect(cardsIn("Shelf Alpha")).toEqual([title("a1"), title("a2")]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 an answer whose items is not an array hides that shelf alone, like a rejection",
    async () => {
      mediaPage["shelf-a"] = vi.fn<PageProvider>(async ({ restrict }) => {
        await restrict(["a1"]);
        return { items: { a1: true }, cursor: null };
      });
      mediaPage["shelf-b"] = paging(["b1"]);
      declare({ shelves: [SHELF_A, SHELF_B] });
      renderApp();

      await screen.findByText(title("b1"));
      await waitFor(() => expect(mediaPage["shelf-a"]).toHaveBeenCalled());
      await settle();
      expect(screen.queryByText("Shelf Alpha")).not.toBeInTheDocument();
      expect(screen.queryByText(title("a1"))).not.toBeInTheDocument();
      expect(screen.getByText("Newest one")).toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-078 a page provider's restrict asks for the target only, with no watch condition",
    async () => {
      getSmartFolders.mockResolvedValue([
        {
          id: "sf-trips",
          drive: DRIVE,
          name: "Trips",
          query: "tag:Trip",
          file_type: null,
          sort_by: null,
          sort_order: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: null,
        },
      ]);
      const { writeAppPrefs } = await import("@/lib/appPrefs");
      writeAppPrefs(DRIVE, { target: "sf-trips" });
      mediaPage["shelf-a"] = paging(["a1"]);
      declare({ shelves: [SHELF_A] });
      renderApp();

      await screen.findByText(title("a1"));
      const calls = restrictCalls();
      expect(calls.length).toBeGreaterThan(0);
      for (const p of calls) {
        expect(p).toMatchObject({ by: "all", key: "all", type: ["video"] });
        expect(p.watch).toBeUndefined();
        expect([p.tag].flat()).toContain("Trip");
      }
    },
  );
});

describe("SPEC-CORE-078 I5 See all on an addon shelf", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-078 I5 links to the provider shelf page when the entry has a page provider, over its href; to href without one; nowhere otherwise",
    async () => {
      const odd: Entry = { id: "feed/new & hot", label: "Odd", priority: 30, addonName: "media_import" };
      mediaPage["shelf-a"] = paging(["a1"]);
      media["shelf-b"] = restricting(["b1"]);
      mediaPage[odd.id] = paging(["o1"]);
      declare({
        shelves: [
          SHELF_A,
          { ...SHELF_B, href: "addons/media_import" },
          odd,
          { id: "shelf-c", label: "Shelf Gamma", priority: 40, addonName: "media_import" },
        ],
      });
      media["shelf-c"] = restricting(["g1"]);
      renderApp();

      await screen.findByText(title("a1"));
      await screen.findByText(title("b1"));
      await screen.findByText(title("o1"));
      await screen.findByText(title("g1"));
      const drive = encodeURIComponent(DRIVE);
      expect(seeAll("Shelf Alpha")).toBe(`/drive/${drive}/apps/video/shelf?entry=shelf-a`);
      expect(seeAll("Odd")).toBe(`/drive/${drive}/apps/video/shelf?entry=${encodeURIComponent(odd.id)}`);
      expect(seeAll("Shelf Beta")).toBe(`/drive/${drive}/addons/media_import`);
      expect(seeAll("Shelf Gamma")).toBeNull();
    },
  );
});

describe("SPEC-CORE-079 bylines on Discover", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I7 a page provider's byline is drawn as one muted truncated line under the title, which keeps its two-line clamp",
    async () => {
      mediaPage["shelf-a"] = paging(["a1", "a2"], { a1: "Channel One · 2026-11-01" });
      declare({ shelves: [SHELF_A] });
      renderApp();

      const byline = await screen.findByText("Channel One · 2026-11-01");
      const a1 = card(title("a1"));
      expect(a1.contains(byline)).toBe(true);
      expect(byline).toHaveClass("mt-1", "block", "truncate", "text-sm", "text-text-muted");
      const titleEl = screen.getByText(title("a1"));
      expect(titleEl.closest(".line-clamp-2")).not.toBeNull();
      expect(titleEl.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(card(title("a2")).querySelector(BYLINE)).toBeNull();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I7 a byline that is not a string, or is empty, draws no line, and a card without one renders as a list-provider card does",
    async () => {
      mediaPage["shelf-a"] = paging(["a1", "a2", "a3", "a4"], {
        a1: "",
        a2: 42,
        a3: { text: "obj" },
        a4: "Shown",
      });
      media["shelf-b"] = restricting(["b1"]);
      declare({ shelves: [SHELF_A, SHELF_B] });
      renderApp();

      await screen.findByText("Shown");
      await screen.findByText(title("b1"));
      const listCard = shape(card(title("b1")));
      for (const id of ["a1", "a2", "a3"]) {
        expect(shape(card(title(id))), id).toEqual(listCard);
      }
      expect(screen.queryByText("42")).not.toBeInTheDocument();
      expect(shape(card(title("a4")))).not.toEqual(listCard);
    },
  );

  it.runIf(addonsLinked)("SPEC-CORE-079 I7 markup in a byline is shown as text", async () => {
    mediaPage["shelf-a"] = paging(["a1"], { a1: "<b>bold</b> & <img src=x>" });
    declare({ shelves: [SHELF_A] });
    renderApp();

    const byline = await screen.findByText("<b>bold</b> & <img src=x>");
    expect(card(title("a1")).querySelector("b, img[src='x']")).toBeNull();
    expect(byline.textContent).toBe("<b>bold</b> & <img src=x>");
  });
});

describe("SPEC-CORE-079 I11 the stored shelf keeps its bylines", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I11 a revisit drawn from the store shows the bylines the provider gave, before the provider answers",
    async () => {
      mediaPage["shelf-a"] = paging(["a2", "a1"], { a2: "Second · Mon", a1: "First · Sun" });
      declare({ shelves: [SHELF_A] });
      const first = renderApp();
      await screen.findByText("Second · Mon");
      first.unmount();

      mediaPage["shelf-a"] = silentPage();
      renderApp();

      expect(await screen.findByText(title("a2"))).toBeInTheDocument();
      expect(cardsIn("Shelf Alpha")).toEqual([title("a2"), title("a1")]);
      expect(card(title("a2")).textContent).toContain("Second · Mon");
      expect(card(title("a1")).textContent).toContain("First · Sun");
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-079 I11 a revisit under another UI locale never draws the shelf stored under the first",
    async () => {
      mediaPage["shelf-a"] = paging(["a1"], { a1: "Posted Monday" });
      declare({ shelves: [SHELF_A] });
      const first = renderApp();
      await screen.findByText("Posted Monday");
      first.unmount();

      intl.locale = "ja";
      const answer = deferred<PageAnswer>();
      mediaPage["shelf-a"] = vi.fn<PageProvider>(() => answer.promise);
      // The provider never restricts, so a restrict request during this visit can only be a rebuild from the store.
      const before = restrictCalls().length;
      renderApp();
      await screen.findByText("Resume me");
      await settle(20);
      expect(restrictCalls().length).toBe(before);
      expect(screen.queryByText("Posted Monday")).not.toBeInTheDocument();
      expect(mediaPage["shelf-a"]).toHaveBeenCalledTimes(1);
      expect((mediaPage["shelf-a"] as ReturnType<typeof silentPage>).mock.calls[0][0].locale).toBe("ja");
    },
  );
});
