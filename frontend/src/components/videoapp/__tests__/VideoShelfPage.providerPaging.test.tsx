/**
 * A provider See all page pages through the addon's cursor; a repeat across
 * the page boundary is dropped, whatever a rename did to the order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { VideoShelfPage } from "../VideoShelfPage";
import { item, title, type Entry, type Params } from "./discoverHarness";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { catalogue, intelPage, intelActions } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "main" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intelPage: {} as Record<string, unknown>,
  intelActions: {} as Record<string, unknown>,
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
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/RenameDialog", () => ({
  RenameDialog: ({ open, onRename }: { open: boolean; onRename: (name: string) => unknown }) =>
    open ? <button onClick={() => void onRename("renamed.mp4")}>submit-rename</button> : null,
}));

vi.mock("@/components/CollectionPicker", () => ({ CollectionPicker: () => null }));

const getShelves = vi.fn();
const renameFile = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 1 } }),
  getSmartFolders: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  renameFile: (...args: unknown[]) => renameFile(...args),
}));

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const intelligenceLinked = (() => {
  const dir = resolve(SRC, "addons", "intelligence");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const DRIVE = "main";
const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };

type Restrict = (ids: string[]) => Promise<string[]>;
type PageProvider = (args: {
  restrict: Restrict;
  cursor: string | null;
}) => Promise<{ items: unknown; cursor: unknown }>;

function restrictAnswer(p: Params) {
  const items = (p.ids as string[]).map((id) => item(id, title(id), DRIVE)).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  live = true;
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {
    this.live = false;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const provider = vi.fn<PageProvider>();

async function openPage() {
  intelPage.pickup = provider;
  catalogue.slots = { "video-discover-recommended": [PICKUP] };
  const props = { drive: DRIVE, entry: "pickup", slot: "recommended", by: null, shelfKey: null, from: null };
  render(
    <ToastProvider>
      <VideoShelfPage {...(props as unknown as Parameters<typeof VideoShelfPage>[0])} />
    </ToastProvider>,
  );
  await screen.findByText(title("r0"));
  await settle();
}

const drawn = () => screen.queryAllByText(/^Vid [\w-]+$/).map((el) => el.textContent ?? "");

async function nextPage() {
  await act(async () => {
    FakeObserver.instances.filter((observer) => observer.live).at(-1)!.trigger();
  });
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const bag of [intelPage, intelActions]) for (const k of Object.keys(bag)) delete bag[k];
  provider.mockReset();
  provider.mockImplementation(async ({ restrict, cursor }) => {
    const ids = cursor === null ? ["r0", "r1", "r2"] : ["r1", "r3"];
    return {
      items: (await restrict(ids)).map((id) => ({ id })),
      cursor: cursor === null ? "next" : null,
    };
  });
  getShelves.mockReset().mockImplementation(async (_d: string, p: Params) => restrictAnswer(p));
  renameFile.mockReset().mockImplementation(async (id: string) => item(id, title(id), DRIVE));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("I4 a provider See all page after a rename", () => {
  it.runIf(intelligenceLinked)(
    "a repeat returned by the next cursor is not drawn twice",
    async () => {
      await openPage();

      const text = screen.getByText(title("r0"));
      await act(async () => {
        fireEvent.contextMenu((text.closest("a") as HTMLElement | null) ?? text);
      });
      const row = await screen.findByRole("menuitem", { name: "Rename" });
      await act(async () => {
        fireEvent.click(row);
      });
      const submit = await screen.findByText("submit-rename");
      await act(async () => {
        fireEvent.click(submit);
      });
      await settle();

      await nextPage();

      const shown = drawn();
      expect(shown).toContain(title("r3"));
      expect(new Set(shown).size).toBe(shown.length);
    },
  );
});
