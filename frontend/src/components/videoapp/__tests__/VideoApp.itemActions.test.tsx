/**
 * SPEC-CORE-150: item actions a `video-discover-recommended` provider attaches to its cards,
 * opened from a Recommended card on Discover, and what a removal does to the stored ids.
 *
 * The intelligence slot module is stubbed under its real id because the loader globs the
 * linked directory; `slotItemActions` is a mutable bag so each case declares its own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { VideoApp } from "../VideoApp";
import {
  PICKUP,
  advance,
  continueAnswer,
  deferred,
  filesAnswer,
  flush,
  freshDrive,
  item,
  layout,
  restrictAnswer,
  restricting,
  shelfCards,
  silent,
  title,
  useFakeClock,
  type Entry,
  type Params,
  type Provider,
} from "./discoverHarness";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { catalogue, intel, intelActions } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
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
  slotProviders: intel,
  slotItemActions: intelActions,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: {} }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const intelligenceLinked = (() => {
  const dir = resolve(SRC, "addons", "intelligence");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const NEW_TAB = "Open in new tab";
const ACTION = "Not interested";
const MESSAGE = "Removed from your picks";
const UNDO = "Undo";
const FAILED = "Couldn't save the change";

type RunResult = { message: string; undo?: () => Promise<void> };
type Action = { id: string; label: string; icon?: unknown; run: (fileId: string) => Promise<RunResult> };

let drive = "";

const isContinue = (p: Params) => p.by === "watch" && p.key === "continue";

function defaultShelves(_d: string, p: Params) {
  if (p.ids !== undefined) return restrictAnswer(p, new Set());
  if (isContinue(p)) return continueAnswer([item("c1", "Resume me", drive)]);
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

const restrictCalls = () =>
  getShelves.mock.calls
    .map(([d, p]): Params & { drive: string } => ({ ...(p as Params), drive: d as string }))
    .filter((p) => p.ids !== undefined);

const idsSince = (from: number) => restrictCalls().slice(from).map((p) => p.ids as string[]);

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

function app(onDrive = drive) {
  return (
    <ToastProvider>
      <VideoApp drive={onDrive} />
    </ToastProvider>
  );
}

async function visit(onDrive = drive) {
  const view = render(app(onDrive));
  await flush();
  return view;
}

/** One action whose `run` resolves with the message and an undo, both recorded. */
function removing(overrides: Partial<Action> = {}) {
  const undo = vi.fn(async () => {});
  const run = vi.fn(async (_fileId: string): Promise<RunResult> => ({ message: MESSAGE, undo }));
  const action: Action = { id: "not-interested", label: ACTION, run, ...overrides };
  intelActions.pickup = vi.fn(() => [action]);
  return { run: action.run as typeof run, undo };
}

function card(id: string): HTMLElement {
  const text = screen.getByText(title(id));
  return (text.closest("a") as HTMLElement | null) ?? text;
}

/** Right-clicks the card; true when the browser's own menu was left alone. */
async function rightClick(id: string): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.contextMenu(card(id));
  });
  await flush();
  return notPrevented;
}

const rows = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
const row = (label: string) => screen.getByRole("menuitem", { name: label });

async function choose(label: string) {
  await act(async () => {
    fireEvent.pointerDown(row(label));
    fireEvent.click(row(label));
  });
  await flush();
}

async function pressUndo() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: UNDO }));
  });
  await flush();
}

function toast(kind: "status" | "alert", text: string): HTMLElement | null {
  const el = screen.queryByText(text);
  return (el?.closest(`[role="${kind}"]`) as HTMLElement | null) ?? null;
}

/** An action whose toast names the file, so each toast's Undo can be told apart. */
function perFileUndo() {
  intelActions.pickup = () => [{
    id: "x",
    label: ACTION,
    run: async (fileId: string) => ({ message: `${MESSAGE} ${fileId}`, undo: vi.fn(async () => {}) }),
  }];
}

async function undoFor(id: string) {
  const toastEl = screen.getByText(`${MESSAGE} ${id}`).closest('[role="status"]') as HTMLElement;
  await act(async () => {
    fireEvent.click(within(toastEl).getByRole("button", { name: UNDO }));
  });
  await flush();
}

async function remove(id: string) {
  await rightClick(id);
  await choose(ACTION);
}

beforeEach(() => {
  useFakeClock();
  drive = freshDrive();
  nickname = "alice";
  localStorage.clear();
  sessionStorage.clear();
  catalogue.loading = false;
  catalogue.catalogueDrive = drive;
  catalogue.slots = {};
  for (const bag of [intel, intelActions]) for (const k of Object.keys(bag)) delete bag[k];
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => filesAnswer([item("n1", "Newest one", drive)]));
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-150 the Recommended card's menu", () => {
  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 I7 D2 a right-click opens exactly Open in new tab and the provider's actions, instead of the browser's menu",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      const browserMenu = await rightClick("r1");

      expect(browserMenu).toBe(false);
      expect(rows()).toEqual([NEW_TAB, ACTION]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 2 the factory gets the drive, the locale and the core translator over the merged messages",
    async () => {
      const factory = vi.fn((args: { drive: string; locale: string; t: (key: string) => string }) => [
        { id: "a", label: args.t("common.seeAll"), run: vi.fn(async () => ({ message: MESSAGE })) },
      ]);
      intelActions.pickup = factory;
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1"]);
      await visit();

      await rightClick("r1");

      expect(factory).toHaveBeenCalled();
      expect(factory.mock.calls[0][0]).toMatchObject({ drive, locale: "en" });
      expect(rows()).toEqual([NEW_TAB, "See all"]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 3 Open in new tab opens the card's own link in a new tab",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1"]);
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      await visit();

      const href = card("r1").getAttribute("href");
      expect(href).toBe(fileLinkHref(item("r1", title("r1"))));
      await rightClick("r1");
      await choose(NEW_TAB);

      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0][0]).toBe(href);
      expect(open.mock.calls[0][1]).toBe("_blank");
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 I7 a 500 ms long press opens the menu, 499 ms does not, and the click after the long press does not navigate while a short tap does",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      await act(async () => {
        fireEvent.touchStart(card("r2"), { touches: [{ clientX: 5, clientY: 5 }] });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(499);
      });
      expect(rows()).toEqual([]);
      let shortTap = false;
      await act(async () => {
        fireEvent.touchEnd(card("r2"));
        shortTap = fireEvent.click(card("r2"));
      });
      expect(shortTap).toBe(true);

      await act(async () => {
        fireEvent.touchStart(card("r1"), { touches: [{ clientX: 5, clientY: 5 }] });
      });
      await advance(500);
      expect(rows()).toEqual([NEW_TAB, ACTION]);
      let followingClick = true;
      await act(async () => {
        fireEvent.touchEnd(card("r1"));
        followingClick = fireEvent.click(card("r1"));
      });
      expect(followingClick).toBe(false);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 2 I7 invalid elements and repeated ids are dropped one by one; a missing icon still draws the row",
    async () => {
      const run = vi.fn(async () => ({ message: MESSAGE }));
      intelActions.pickup = () => [
        { id: "a", label: "Alpha", run },
        { id: "b", run },
        { id: "c", label: "Gamma" },
        { id: "a", label: "Alpha again", run },
        { id: 5, label: "Number id", run },
        { id: "e", label: 7, run },
        null,
        "text",
        { id: "d", label: "Delta", run, icon: undefined },
      ];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1"]);
      await visit();

      await rightClick("r1");

      expect(rows()).toEqual([NEW_TAB, "Alpha", "Delta"]);
    },
  );

  const noActions: [string, () => void][] = [
    ["no slotItemActions entry", () => {}],
    ["a factory that throws", () => {
      intelActions.pickup = () => {
        throw new Error("boom");
      };
    }],
    ["a factory that returns no array", () => {
      intelActions.pickup = () => ({ id: "a", label: "Alpha", run: async () => ({ message: "m" }) });
    }],
    ["an array with no valid element", () => {
      intelActions.pickup = () => [{ id: "a", label: "Alpha" }];
    }],
  ];

  it.runIf(intelligenceLinked).each(noActions)(
    "SPEC-CORE-150 I7 with %s the card leaves the browser's menu alone, while valid actions open the app's",
    async (_name, arrange) => {
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1"]);
      removing();
      const withActions = await visit();
      expect(await rightClick("r1")).toBe(false);
      expect(rows()).toEqual([NEW_TAB, ACTION]);
      withActions.unmount();

      for (const k of Object.keys(intelActions)) delete intelActions[k];
      arrange();
      await visit();

      expect(await rightClick("r1")).toBe(true);
      expect(rows()).toEqual([]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 7 an addon shelf's cards never read item actions, even keyed by their entry id",
    async () => {
      const shelf: Entry = { id: "pickup-shelf", label: "Shelf Alpha", priority: 10, addonName: "intelligence" };
      removing();
      intelActions["pickup-shelf"] = intelActions.pickup;
      declare({ recommended: [PICKUP], shelves: [shelf] });
      intel.pickup = restricting(["r1"]);
      intel["pickup-shelf"] = restricting(["s1"]);
      await visit();

      expect(await rightClick("r1")).toBe(false);
      expect(rows()).toEqual([NEW_TAB, ACTION]);
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await flush();

      expect(shelfCards("Shelf Alpha")).toEqual([title("s1")]);
      expect(await rightClick("s1")).toBe(true);
      expect(rows()).toEqual([]);
    },
  );
});

describe("SPEC-CORE-150 running an action and undoing it on Discover", () => {
  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 I4 the card leaves when run resolves, and the success toast shows the message with Undo",
    async () => {
      const { run } = removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      await visit();

      await remove("r2");

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith("r2");
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);
      expect(toast("status", MESSAGE)).not.toBeNull();
      expect(screen.getByRole("button", { name: UNDO })).toBeInTheDocument();
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 D4 I4 while run is pending the card stays, the menu closes, and a reopened menu shows the row disabled and cannot run it again",
    async () => {
      const pending = deferred<RunResult>();
      const run = vi.fn(() => pending.promise);
      intelActions.pickup = () => [{ id: "x", label: ACTION, run }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      await remove("r1");
      expect(rows()).toEqual([]);
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r2")]);

      await rightClick("r1");
      expect(rows()).toEqual([NEW_TAB, ACTION]);
      expect(row(ACTION)).toBeDisabled();
      await act(async () => {
        fireEvent.click(row(ACTION));
      });
      await flush();
      expect(run).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await act(async () => pending.resolve({ message: MESSAGE }));
      await flush();
      expect(shelfCards("Recommended")).toEqual([title("r2")]);
    },
  );

  const failures: [string, () => Promise<unknown>][] = [
    ["a rejection", () => Promise.reject(new Error("net"))],
    ["a resolution without a message", () => Promise.resolve({ undo: async () => {} })],
    ["a resolution with a non-string message", () => Promise.resolve({ message: 5 })],
    ["a resolution with nothing", () => Promise.resolve(undefined)],
  ];

  it.runIf(intelligenceLinked).each(failures)(
    "SPEC-CORE-150 rule 4 and 6 I4 after %s the card stays and the error toast says the change was not saved",
    async (_name, outcome) => {
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: vi.fn(outcome) }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      await remove("r1");

      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r2")]);
      expect(toast("alert", FAILED)).not.toBeNull();
      expect(screen.queryByText(MESSAGE)).toBeNull();
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 I4 a resolution without an undo shows the message with no Undo",
    async () => {
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: MESSAGE }) }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      await remove("r1");

      expect(shelfCards("Recommended")).toEqual([title("r2")]);
      expect(toast("status", MESSAGE)).not.toBeNull();
      expect(screen.queryByRole("button", { name: UNDO })).toBeNull();
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 I4 Undo returns the card at its former index only after undo resolves",
    async () => {
      const gate = deferred<void>();
      const undo = vi.fn(() => gate.promise);
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: MESSAGE, undo }) }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      await visit();

      await remove("r2");
      await pressUndo();
      expect(undo).toHaveBeenCalledTimes(1);
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);

      await act(async () => gate.resolve());
      await flush();
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r2"), title("r3")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 each undone card returns at the index it had when it left",
    async () => {
      perFileUndo();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3", "r4"]);
      await visit();

      await remove("r2");
      await remove("r3");
      await remove("r4");
      expect(shelfCards("Recommended")).toEqual([title("r1")]);

      await undoFor("r2");
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r2")]);
      await undoFor("r3");
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3"), title("r2")]);
      await undoFor("r4");
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r4"), title("r3"), title("r2")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 a former index past the current end is clamped to it",
    async () => {
      perFileUndo();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3", "r4"]);
      await visit();

      await remove("r4");
      await remove("r1");
      expect(shelfCards("Recommended")).toEqual([title("r2"), title("r3")]);

      await undoFor("r4");
      expect(shelfCards("Recommended")).toEqual([title("r2"), title("r3"), title("r4")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 6 I4 a rejected undo leaves the card removed and shows the error toast",
    async () => {
      const undo = vi.fn(() => Promise.reject(new Error("net")));
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: MESSAGE, undo }) }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      await visit();

      await remove("r1");
      await pressUndo();

      expect(undo).toHaveBeenCalledTimes(1);
      expect(shelfCards("Recommended")).toEqual([title("r2")]);
      expect(toast("alert", FAILED)).not.toBeNull();
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 SPEC-CORE-076 I1 I2 as revised removing the last card drops Recommended, and Undo draws it again in its former place",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1"]);
      await visit();
      expect(layout()).toEqual(["Continue", "Recommended", "New"]);

      await remove("r1");
      expect(layout()).toEqual(["Continue", "New"]);

      await pressUndo();
      expect(layout()).toEqual(["Continue", "Recommended", "New"]);
      expect(shelfCards("Recommended")).toEqual([title("r1")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 I4 after a profile change Undo does nothing",
    async () => {
      const { undo } = removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2"]);
      const view = await visit();

      await remove("r1");
      nickname = "bob";
      view.rerender(app());
      await flush();
      await pressUndo();

      expect(undo).not.toHaveBeenCalled();
    },
  );
});

describe("SPEC-CORE-150 a removal and the stored Recommended ids", () => {
  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 I8 the next visit's rebuild does not draw a removed id",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      const first = await visit();
      await remove("r2");
      first.unmount();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["r1", "r3"]]);
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 4 SPEC-CORE-076 I7 as revised a provider answer stored after the removal, also after unmount, is stored without the id",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      (await visit()).unmount();

      const answer = deferred<void>();
      intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
        await answer.promise;
        return restrict(["r1", "r2", "r3"]);
      });
      const second = await visit();
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r2"), title("r3")]);
      await remove("r2");
      second.unmount();
      await act(async () => answer.resolve());
      await flush();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["r1", "r3"]]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 I8 an undo puts the id back into the stored ids at its removal-time index",
    async () => {
      removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      const first = await visit();
      await remove("r2");
      await pressUndo();
      first.unmount();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["r1", "r2", "r3"]]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-150 rule 5 after the visit's key changed, Undo only calls undo and restores the id under the old key",
    async () => {
      const { undo } = removing();
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      const view = await visit();
      await remove("r2");

      const other = freshDrive();
      catalogue.catalogueDrive = other;
      intel.pickup = restricting(["o1"]);
      view.rerender(app(other));
      await flush();
      expect(shelfCards("Recommended")).toEqual([title("o1")]);

      await pressUndo();
      expect(undo).toHaveBeenCalledTimes(1);
      expect(shelfCards("Recommended")).toEqual([title("o1")]);
      view.unmount();

      catalogue.catalogueDrive = drive;
      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit(drive);

      expect(idsSince(from)).toEqual([["r1", "r2", "r3"]]);
    },
  );
});
