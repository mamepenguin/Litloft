/**
 * SPEC-CORE-081 on Discover: Recommended links See all to the core shelf page in Recommended
 * mode when the entry chosen to supply it also exports `slotPageProviders[entry.id]`.
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
import { item, title, type Entry, type Params, type Provider } from "./discoverHarness";

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

const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

function restricting(ids: string[]) {
  return vi.fn<Provider>(async ({ restrict }) => restrict(ids));
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

/** A page provider that restricts `ids` and answers what was accepted, with no further page. */
function paging(ids: string[]) {
  return vi.fn<PageProvider>(async ({ restrict }) => ({
    items: (await restrict(ids)).map((id) => ({ id })),
    cursor: null,
  }));
}

const recommendedHref = (drive: string, entry: string) =>
  `/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry)}&slot=recommended`;

describe("SPEC-CORE-081 I1 See all on Recommended", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I1 I2 links to the shelf page in Recommended mode with drive and entry encoded, without calling the page provider or changing the drawn ids",
    async () => {
      const odd: Entry = { id: "feed/new & hot", label: "Odd", priority: 10, addonName: "intelligence" };
      const list = restricting(["r3", "r1", "r2"]);
      const page = paging(["p1"]);
      intel[odd.id] = list;
      intelPage[odd.id] = page;
      declare({ recommended: [odd] });
      renderApp();

      await screen.findByText(title("r3"));
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, odd.id)));
      expect(DRIVE).toContain(" ");
      expect(cardsIn("Recommended")).toEqual([title("r3"), title("r1"), title("r2")]);
      expect(list).toHaveBeenCalledTimes(1);
      expect(list.mock.calls[0][0].limit).toBe(12);
      expect(page).not.toHaveBeenCalled();
      expect(restrictCalls().flatMap((p) => p.ids as string[])).toEqual(["r3", "r1", "r2"]);
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I1 the link is there exactly when the chosen entry also exports a page provider",
    async () => {
      intel.pickup = restricting(["r1"]);
      intelPage.pickup = paging(["r1"]);
      declare({ recommended: [PICKUP] });
      const first = renderApp();
      await screen.findByText(title("r1"));
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, "pickup")));
      first.unmount();

      DRIVE = freshDrive();
      catalogue.catalogueDrive = DRIVE;
      delete intelPage.pickup;
      intel.pickup = restricting(["r2"]);
      renderApp();
      await screen.findByText(title("r2"));
      await settle(10);
      expect(seeAll("Recommended")).toBeNull();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I1 the link follows the entry chosen to supply Recommended, not an earlier entry that has only a page provider",
    async () => {
      const second: Entry = { id: "mi-rec", label: "MI rec", priority: 20, addonName: "media_import" };
      intelPage.pickup = paging(["p1"]);
      media[second.id] = restricting(["m1"]);
      mediaPage[second.id] = paging(["m1"]);
      declare({ recommended: [PICKUP, second] });
      const first = renderApp();
      await screen.findByText(title("m1"));
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, second.id)));
      first.unmount();

      DRIVE = freshDrive();
      catalogue.catalogueDrive = DRIVE;
      delete mediaPage[second.id];
      media[second.id] = restricting(["m2"]);
      renderApp();
      await screen.findByText(title("m2"));
      await settle(10);
      expect(seeAll("Recommended")).toBeNull();
      expect(intelPage.pickup).not.toHaveBeenCalled();
    },
  );

  it.runIf(addonsLinked).each([
    [
      "a list provider and an href",
      { href: "addons/media_import" },
      false,
      (drive: string) => `/drive/${encodeURIComponent(drive)}/addons/media_import`,
    ],
    ["a page provider", {}, true, (drive: string) => `/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=pickup`],
  ] as [string, Partial<Entry>, boolean, (drive: string) => string][])(
    "SPEC-CORE-081 I1 a video-discover-shelves entry with the same id and %s keeps its own See all",
    async (_name, extra, hasPage, expected) => {
      intel.pickup = restricting(["r1"]);
      intelPage.pickup = paging(["r1"]);
      const shelf: Entry = { id: "pickup", label: "Shelf Pickup", priority: 10, addonName: "media_import", ...extra };
      if (hasPage) mediaPage.pickup = paging(["s1"]);
      else media.pickup = restricting(["s1"]);
      declare({ recommended: [PICKUP], shelves: [shelf] });
      renderApp();

      await screen.findByText(title("r1"));
      await screen.findByText(title("s1"));
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, "pickup")));
      expect(seeAll("Shelf Pickup")).toBe(expected(DRIVE));
    },
  );
});

describe("SPEC-CORE-081 I1 See all on a Recommended shelf drawn from the store", () => {
  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I1 a revisit drawn from the stored ids carries the link while the list provider has not answered",
    async () => {
      intel.pickup = restricting(["r2", "r1"]);
      intelPage.pickup = paging(["r1"]);
      declare({ recommended: [PICKUP] });
      const first = renderApp();
      await screen.findByText(title("r2"));
      first.unmount();

      intel.pickup = vi.fn<Provider>(() => new Promise<string[]>(() => {}));
      renderApp();
      await screen.findByText(title("r2"));
      expect(cardsIn("Recommended")).toEqual([title("r2"), title("r1")]);
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, "pickup")));
      expect(intelPage.pickup).not.toHaveBeenCalled();
    },
  );

  it.runIf(addonsLinked)(
    "SPEC-CORE-081 I1 a stored Recommended gains or loses the link with the page provider of this visit",
    async () => {
      intel.pickup = restricting(["r2", "r1"]);
      declare({ recommended: [PICKUP] });
      const first = renderApp();
      await screen.findByText(title("r2"));
      await settle(10);
      expect(seeAll("Recommended")).toBeNull();
      first.unmount();

      intel.pickup = vi.fn<Provider>(() => new Promise<string[]>(() => {}));
      intelPage.pickup = paging(["r1"]);
      const second = renderApp();
      await screen.findByText(title("r2"));
      await waitFor(() => expect(seeAll("Recommended")).toBe(recommendedHref(DRIVE, "pickup")));
      second.unmount();

      delete intelPage.pickup;
      renderApp();
      await screen.findByText(title("r2"));
      await settle(10);
      expect(seeAll("Recommended")).toBeNull();
    },
  );
});
