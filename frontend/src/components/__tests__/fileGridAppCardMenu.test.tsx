/**
 * SPEC-CORE-169: FileGrid's `appCardMenu` opt-in, through both layouts (the 16:9 card and
 * the justified cell). Animation frames are held in a queue that only `flushFrames` runs,
 * so "acts within the click" and "acts on the next frame" can be told apart.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Ban, Star } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const clipboardCopy = vi.fn();
const clipboardCut = vi.fn();
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: clipboardCopy,
    cut: clipboardCut,
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

const copyText = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/copyText", () => ({ copyText: (text: string) => copyText(text) }));

const renameFile = vi.fn();
const moveFile = vi.fn();
const deleteFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  deleteWatchProgress: vi.fn(() => Promise.resolve()),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
  moveFile: (...args: unknown[]) => moveFile(...args),
  renameFile: (...args: unknown[]) => renameFile(...args),
}));

vi.mock("@/hooks/useShortcuts", () => ({
  useShortcuts: () => {},
}));

const toastCalls = vi.fn();
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    success: (...a: unknown[]) => toastCalls("success", ...a),
    error: (...a: unknown[]) => toastCalls("error", ...a),
    info: (...a: unknown[]) => toastCalls("info", ...a),
  }),
}));

vi.mock("@/components/RenameDialog", () => ({
  RenameDialog: ({ open, onRename, onCancel }: { open: boolean; onRename: (n: string) => unknown; onCancel: () => void }) =>
    open ? (
      <div data-testid="rename-dialog">
        <button onClick={() => void onRename("renamed.mp4")}>submit-rename</button>
        <button onClick={() => onCancel()}>cancel-rename</button>
      </div>
    ) : null,
}));

vi.mock("@/components/MoveDialog", () => ({
  MoveDialog: ({ open, onMove, onCancel }: { open: boolean; onMove: (p: string) => unknown; onCancel: () => void }) =>
    open ? (
      <div data-testid="move-dialog">
        <button onClick={() => void onMove("Elsewhere")}>submit-move</button>
        <button onClick={() => onCancel()}>cancel-move</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => unknown; onCancel: () => void }) =>
    open
      ? createPortal(
          <div data-testid="confirm-dialog">
            <button onClick={() => void onConfirm()}>submit-trash</button>
            <button onClick={() => onCancel()}>cancel-trash</button>
          </div>,
          document.body,
        )
      : null,
}));

vi.mock("@/components/CollectionPicker", () => ({
  CollectionPicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="collection-picker" /> : null,
}));

import { FileGrid } from "../FileGrid";
import { CarouselSection } from "../CarouselSection";
import { ContinueWatchingSection } from "../ContinueWatchingSection";
import type { FileItem, WatchHistoryItem } from "@/types";

const NEW_TAB = "Open in new tab";
const DIVIDER = "DIVIDER";
const TODAY_ROWS = ["Download", "Add to collection", "Copy", "Cut", "Copy ID", "Rename", "Move", "Move to Trash"];
const SORT_QUERY = "?sort=name&order=asc&view=liked";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem =>
  ({
    image_width: null,
    image_height: null,
    id: "vid000000001",
    filename: "clip.mp4",
    title: "Clip",
    description: "",
    drive: "media",
    folder_path: "Trips/2026",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 10,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    modified_at: null,
    ...overrides,
  }) as FileItem;

/** Twenty measurable photographs, so `FileGrid` packs them into the justified layout. */
const photos = (): FileItem[] =>
  Array.from({ length: 20 }, (_, i) =>
    makeFile({
      id: `p${String(i).padStart(11, "0")}`,
      title: `Photo ${i}`,
      filename: `shot-${i}.jpg`,
      file_type: "image",
      mime_type: "image/jpeg",
      duration: null,
      image_width: 3000,
      image_height: 4000,
    }),
  );

type Layout = {
  name: string;
  files: () => FileItem[];
  target: string;
  /** The element a right-click lands on. */
  card: (container: HTMLElement) => HTMLElement;
  /** The link the card itself carries. */
  link: (container: HTMLElement) => HTMLAnchorElement;
};

function deepest(el: HTMLElement): HTMLElement {
  let node = el;
  while (node.firstElementChild) node = node.firstElementChild as HTMLElement;
  return node;
}

const LAYOUTS: Layout[] = [
  {
    name: "16:9 card",
    files: () => [makeFile()],
    target: "vid000000001",
    card: () => screen.getAllByText("Clip")[0],
    link: () => screen.getAllByText("Clip")[0].closest("a") as HTMLAnchorElement,
  },
  {
    name: "justified cell",
    files: photos,
    target: "p00000000000",
    card: (container) => {
      const cell = container.querySelector(".justified-grid-cell");
      expect(cell, "FileGrid did not pack the photos").not.toBeNull();
      return deepest(cell as HTMLElement);
    },
    link: (container) =>
      container.querySelector(".justified-grid-cell a") as HTMLAnchorElement,
  },
];

let frames: FrameRequestCallback[] = [];

function flushFrames() {
  act(() => {
    while (frames.length > 0) frames.shift()!(performance.now());
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  clipboardCopy.mockReset();
  clipboardCut.mockReset();
  copyText.mockReset().mockResolvedValue(true);
  renameFile.mockReset().mockImplementation(async () => makeFile({ filename: "renamed.mp4" }));
  moveFile.mockReset().mockImplementation(async () => makeFile({ folder_path: "Elsewhere" }));
  deleteFile.mockReset().mockResolvedValue(undefined);
  toastCalls.mockReset();
});

type ExtraRow = { id: string; label: string; icon: typeof Ban; onSelect: () => unknown };

const extras = (): ExtraRow[] => [
  { id: "not-interested", label: "Not interested", icon: Ban, onSelect: vi.fn() },
  { id: "second", label: "Second extra", icon: Star, onSelect: vi.fn() },
];

function grid(props: Record<string, unknown>): ReactElement {
  return <FileGrid {...(props as unknown as ComponentProps<typeof FileGrid>)} />;
}

function mount(layout: Layout, props: Record<string, unknown> = {}) {
  return render(grid({ files: layout.files(), sortQuery: SORT_QUERY, ...props }));
}

function openMenu(layout: Layout, container: HTMLElement) {
  act(() => {
    fireEvent.contextMenu(layout.card(container));
  });
}

/** The menu's children in order: a row by its label, anything else as DIVIDER. */
function menuShape(): string[] {
  const rows = screen.queryAllByRole("menuitem");
  if (rows.length === 0) return [];
  return [...rows[0].parentElement!.children].map((el) =>
    el.getAttribute("role") === "menuitem" ? (el.textContent ?? "").trim() : DIVIDER,
  );
}

/** Clicks a row and returns without letting any animation frame run. */
function choose(label: string) {
  expect(menuShape(), `the menu has no ${label} row`).toContain(label);
  const row = screen.getByRole("menuitem", { name: label });
  act(() => {
    fireEvent.pointerDown(row);
    fireEvent.click(row);
  });
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  flushFrames();
}

function menuShapeOf(layout: Layout, props: Record<string, unknown>): string[] {
  const { container } = mount(layout, props);
  openMenu(layout, container);
  const out = menuShape();
  cleanup();
  return out;
}

const hasSelectNone = (el: Element | null) =>
  (el?.getAttribute("class") ?? "").split(/\s+/).includes("select-none");

/** Whether `el` or any ancestor below `stop` carries `select-none`. */
function selectNoneBetween(el: Element, stop: Element): boolean {
  for (let node: Element | null = el; node && node !== stop; node = node.parentElement) {
    if (hasSelectNone(node)) return true;
  }
  return false;
}

describe.each(LAYOUTS)("SPEC-CORE-169 the opt-in menu on a FileGrid $name", (layout) => {
  it("SPEC-CORE-169 I1 I6 with the opt-in the menu is Open in new tab, then exactly the rows the card offers without it; without it there is no such row", () => {
    const today = menuShapeOf(layout, {});
    expect(today).toEqual(TODAY_ROWS);

    expect(menuShapeOf(layout, { appCardMenu: true })).toEqual([NEW_TAB, ...today]);
  });

  it("SPEC-CORE-169 I1 the row comes after the extra rows and their divider, before today's rows", () => {
    const today = menuShapeOf(layout, {});
    const withExtras = menuShapeOf(layout, { extraMenuItems: () => extras() });
    expect(withExtras).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);

    expect(menuShapeOf(layout, { appCardMenu: true, extraMenuItems: () => extras() })).toEqual([
      "Not interested",
      "Second extra",
      DIVIDER,
      NEW_TAB,
      ...today,
    ]);
  });

  it("SPEC-CORE-169 I1 with selectable the opt-in attaches no menu", () => {
    expect(menuShapeOf(layout, { appCardMenu: true })).toContain(NEW_TAB);

    const { container } = mount(layout, {
      appCardMenu: true,
      selectable: true,
      selectedIds: new Set<string>(),
      onSelect: vi.fn(),
    });
    openMenu(layout, container);
    expect(menuShape()).toEqual([]);
  });

  it("SPEC-CORE-169 I2 Open in new tab opens the card's own href in a new tab within the click, sends nothing and closes the menu", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const { container } = mount(layout, { appCardMenu: true });
    const href = layout.link(container).getAttribute("href");
    const want = `/drive/media/Trips/2026?file=${layout.target}&sort=name&order=asc`;

    openMenu(layout, container);
    choose(NEW_TAB);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]).toEqual([want, "_blank"]);
    expect(href).toBe(want);
    expect(menuShape()).toEqual([]);
    flushFrames();
    expect(open).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const request of [renameFile, moveFile, deleteFile]) expect(request).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-169 I2 a blocked new tab closes the menu and says nothing", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = mount(layout, { appCardMenu: true });

    openMenu(layout, container);
    choose(NEW_TAB);
    flushFrames();

    expect(open).toHaveBeenCalledTimes(1);
    expect(menuShape()).toEqual([]);
    expect(toastCalls).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

type RowCase = { row: string; acted: () => boolean };

const ROW_CASES: RowCase[] = [
  { row: "Download", acted: () => (window.open as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0 },
  { row: "Add to collection", acted: () => screen.queryByTestId("collection-picker") !== null },
  { row: "Copy", acted: () => clipboardCopy.mock.calls.length > 0 },
  { row: "Cut", acted: () => clipboardCut.mock.calls.length > 0 },
  { row: "Copy ID", acted: () => copyText.mock.calls.length > 0 || screen.queryByRole("dialog") !== null },
  { row: "Rename", acted: () => screen.queryByTestId("rename-dialog") !== null },
  { row: "Move", acted: () => screen.queryByTestId("move-dialog") !== null },
  { row: "Move to Trash", acted: () => screen.queryByTestId("confirm-dialog") !== null },
];

describe.each(LAYOUTS)("SPEC-CORE-169 when a row acts, on a FileGrid $name", (layout) => {
  it.each(ROW_CASES)(
    "SPEC-CORE-169 I3 I6 $row acts within its click with the opt-in, and only on the next animation frame without it",
    ({ row, acted }) => {
      vi.spyOn(window, "open").mockImplementation(() => null);

      const plain = mount(layout);
      openMenu(layout, plain.container);
      choose(row);
      expect(acted(), `${row} acted before a frame ran without the opt-in`).toBe(false);
      flushFrames();
      expect(acted(), `${row} did not act on the next frame without the opt-in`).toBe(true);
      cleanup();

      clipboardCopy.mockReset();
      clipboardCut.mockReset();
      copyText.mockReset().mockResolvedValue(true);
      (window.open as unknown as ReturnType<typeof vi.fn>).mockClear();

      const opted = mount(layout, { appCardMenu: true });
      openMenu(layout, opted.container);
      choose(row);
      expect(acted(), `${row} did not act within its click with the opt-in`).toBe(true);
    },
  );
});

const WRITES = [
  { row: "Rename", dialog: "rename-dialog", submit: "submit-rename", cancel: "cancel-rename", request: renameFile },
  { row: "Move", dialog: "move-dialog", submit: "submit-move", cancel: "cancel-move", request: moveFile },
  { row: "Move to Trash", dialog: "confirm-dialog", submit: "submit-trash", cancel: "cancel-trash", request: deleteFile },
];

describe.each(LAYOUTS)("SPEC-CORE-169 I5 a write from the opt-in menu on a FileGrid $name", (layout) => {
  async function start(row: string) {
    const onRefresh = vi.fn();
    const { container } = mount(layout, { appCardMenu: true, onRefresh });
    openMenu(layout, container);
    choose(row);
    const dialog = WRITES.find((w) => w.row === row)!.dialog;
    expect(screen.queryByTestId(dialog), `${row} did not open its dialog within the click`).not.toBeNull();
    return onRefresh;
  }

  it.each(WRITES)("SPEC-CORE-169 I5 a successful $row calls onRefresh exactly once", async ({ row, submit, request }) => {
    const onRefresh = await start(row);
    await act(async () => {
      fireEvent.click(screen.getByText(submit));
    });
    await settle();

    expect(request).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each(WRITES)("SPEC-CORE-169 I5 a failed $row does not call onRefresh", async ({ row, submit, request }) => {
    request.mockReset().mockRejectedValue(new Error("boom"));
    const onRefresh = await start(row);
    await act(async () => {
      fireEvent.click(screen.getByText(submit));
    });
    await settle();

    expect(request).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each(WRITES)("SPEC-CORE-169 I5 a cancelled $row does not call onRefresh", async ({ row, cancel, request }) => {
    const onRefresh = await start(row);
    await act(async () => {
      fireEvent.click(screen.getByText(cancel));
    });
    await settle();

    expect(request).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe.each(LAYOUTS)("SPEC-CORE-169 selection styles on a FileGrid $name", (layout) => {
  it("SPEC-CORE-169 I4 I6 the card's link stops selection with the opt-in, and nothing from the grid to the link does without it", () => {
    const plain = mount(layout);
    const plainLink = layout.link(plain.container);
    expect(selectNoneBetween(plainLink, plain.container)).toBe(false);
    cleanup();

    const opted = mount(layout, { appCardMenu: true });
    const link = layout.link(opted.container);
    expect(hasSelectNone(link)).toBe(true);
    for (const a of opted.container.querySelectorAll("a")) {
      if ((a.getAttribute("href") ?? "").includes("file=")) {
        expect(selectNoneBetween(a, opted.container)).toBe(true);
      }
    }
  });
});

describe("SPEC-CORE-169 I6 the FileCards drawn outside FileGrid", () => {
  it("SPEC-CORE-169 I6 CarouselSection and ContinueWatchingSection cards carry no select-none, while an opted-in grid card does", () => {
    const files = [makeFile()];
    const carousel = render(
      <CarouselSection {...({ title: "Pickup", icon: null, files, loading: false } as unknown as ComponentProps<typeof CarouselSection>)} />,
    );
    const carouselLink = screen.getAllByText("Clip")[0].closest("a") as HTMLElement;
    expect(selectNoneBetween(carouselLink, carousel.container)).toBe(false);
    cleanup();

    const item = { ...makeFile(), watch_progress: { position: 30, duration: 120 } } as WatchHistoryItem;
    const continuing = render(<ContinueWatchingSection items={[item]} loading={false} />);
    const continueLink = screen.getAllByText("Clip")[0].closest("a") as HTMLElement;
    expect(selectNoneBetween(continueLink, continuing.container)).toBe(false);
    cleanup();

    const opted = mount(LAYOUTS[0], { appCardMenu: true });
    expect(selectNoneBetween(LAYOUTS[0].link(opted.container), opted.container)).toBe(true);
  });
});
