/**
 * SPEC-CORE-150: item actions on the Recommended See all page (`?entry=…&slot=recommended`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { VideoShelfPage } from "../VideoShelfPage";
import { deferred, item, title, type Entry, type Params } from "./discoverHarness";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { catalogue, intelPage, intelActions, profile } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "main" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intelPage: {} as Record<string, unknown>,
  intelActions: {} as Record<string, unknown>,
  profile: { nickname: "alice" as string | null },
}));

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
  slotProviders: {},
  slotPageProviders: intelPage,
  slotItemActions: intelActions,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: {}, slotPageProviders: {} }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

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
const getCollections = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
}));

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const intelligenceLinked = (() => {
  const dir = resolve(SRC, "addons", "intelligence");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const DRIVE = "main";
const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
const ACTION = "Not interested";
const MESSAGE = "Removed from your picks";
const UNDO = "Undo";
const FAILED = "Couldn't save the change";

type Restrict = (ids: string[]) => Promise<string[]>;
type PageProvider = (args: { restrict: Restrict }) => Promise<{ items: unknown; cursor: unknown }>;

function restrictAnswer(p: Params) {
  const items = (p.ids as string[]).map((id) => item(id, title(id), DRIVE)).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

function answering(answer: string[]) {
  return vi.fn<PageProvider>(async ({ restrict }) => ({
    items: (await restrict(answer)).map((id) => ({ id })),
    cursor: null,
  }));
}

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function openPage(answer: string[]) {
  intelPage.pickup = answering(answer);
  catalogue.slots = { "video-discover-recommended": [PICKUP] };
  const props = { drive: DRIVE, entry: "pickup", slot: "recommended", by: null, shelfKey: null, from: null };
  render(
    <ToastProvider>
      <VideoShelfPage {...(props as unknown as Parameters<typeof VideoShelfPage>[0])} />
    </ToastProvider>,
  );
  await screen.findByText(title(answer[0]));
  await settle();
}

const drawn = () => screen.queryAllByText(/^Vid [\w-]+$/).map((el) => el.textContent ?? "");

async function remove(id: string) {
  const text = screen.getByText(title(id));
  await act(async () => {
    fireEvent.contextMenu((text.closest("a") as HTMLElement | null) ?? text);
  });
  await settle();
  const row = screen.getByRole("menuitem", { name: ACTION });
  await act(async () => {
    fireEvent.pointerDown(row);
    fireEvent.click(row);
  });
  await settle();
}

async function pressUndo() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: UNDO }));
  });
  await settle();
}

beforeEach(() => {
  profile.nickname = "alice";
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const bag of [intelPage, intelActions]) for (const k of Object.keys(bag)) delete bag[k];
  getShelves.mockReset().mockImplementation(async (_d: string, p: Params) => restrictAnswer(p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 1 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-150 item actions on the Recommended See all page", () => {
  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 3 4 5 a card leaves when run resolves and Undo returns it at its former index",
    async () => {
      const undo = vi.fn(async () => {});
      const run = vi.fn(async () => ({ message: MESSAGE, undo }));
      intelActions.pickup = () => [{ id: "x", label: ACTION, run }];
      await openPage(["r1", "r2", "r3"]);

      await remove("r2");
      expect(run).toHaveBeenCalledWith("r2");
      expect(drawn()).toEqual([title("r1"), title("r3")]);
      expect(screen.getByText(MESSAGE).closest('[role="status"]')).not.toBeNull();

      await pressUndo();
      expect(undo).toHaveBeenCalledTimes(1);
      expect(drawn()).toEqual([title("r1"), title("r2"), title("r3")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 5 I4 the last card leaving empties the grid, and Undo draws it again",
    async () => {
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: MESSAGE, undo: async () => {} }) }];
      await openPage(["r1"]);

      await remove("r1");
      expect(drawn()).toEqual([]);

      await pressUndo();
      expect(drawn()).toEqual([title("r1")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 D4 I4 a pending run keeps the card, and a rejection keeps it with the error toast",
    async () => {
      const pending = deferred<never>();
      const run = vi.fn(() => pending.promise);
      intelActions.pickup = () => [{ id: "x", label: ACTION, run }];
      await openPage(["r1", "r2"]);

      await remove("r1");
      expect(drawn()).toEqual([title("r1"), title("r2")]);

      await act(async () => pending.reject(new Error("net")));
      await settle();
      expect(drawn()).toEqual([title("r1"), title("r2")]);
      expect(screen.getByText(FAILED).closest('[role="alert"]')).not.toBeNull();
    },
  );
});

describe("SPEC-CORE-157 the Recommended See all page's card menu", () => {
  const FILE_ROWS = ["Open in new tab", "Download", "Add to collection", "Copy", "Cut", "Copy ID", "Rename", "Move", "Move to Trash"];

  function sequence(): string[] {
    const menu = screen.queryAllByRole("menuitem")[0]?.parentElement;
    if (!menu) return [];
    return [...menu.querySelectorAll('[role="menuitem"], [role="separator"]')].map((el) =>
      el.getAttribute("role") === "separator" ? "---" : el.textContent?.trim() ?? "",
    );
  }

  async function rightClick(id: string) {
    const text = screen.getByText(title(id));
    await act(async () => {
      fireEvent.contextMenu((text.closest("a") as HTMLElement | null) ?? text);
    });
    await settle();
  }

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I1 SPEC-CORE-150 I7 as revised a card opens the actions, one divider, then the file menu",
    async () => {
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: MESSAGE }) }];
      await openPage(["r1", "r2"]);

      await rightClick("r1");

      const rows = sequence();
      expect(rows.slice(0, 2)).toEqual([ACTION, "---"]);
      expect(rows.slice(2).filter((r) => r !== "---")).toEqual(FILE_ROWS);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I1 without valid actions a card opens the file menu with no action rows",
    async () => {
      await openPage(["r1", "r2"]);

      await rightClick("r1");

      expect(sequence()[0]).toBe("Open in new tab");
      expect(sequence().filter((r) => r !== "---")).toEqual(FILE_ROWS);
    },
  );
});
