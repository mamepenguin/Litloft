import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { deleteFile } from "@/lib/api";
import { FileActions } from "../FileActions";
import { ShortcutsProvider } from "../ShortcutsProvider";
import type { FileItem } from "@/types";

// The detail menu is built by `useFileMenuItems`, which reads the
// clipboard for Copy / Cut. The app wraps everything in the provider
// (`app/layout.tsx`); this stands in for it.
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

vi.mock("@/lib/api", () => ({
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  moveFile: vi.fn().mockResolvedValue({}),
  renameFile: vi.fn().mockResolvedValue({}),
  getFolders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel, message }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open, onRename, onCancel }: any) =>
    open ? (
      <div data-testid="rename-dialog">
        <button onClick={() => onRename("new-name.mp4")}>Rename</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove, onCancel }: any) =>
    open ? (
      <div data-testid="move-dialog">
        <button onClick={() => onMove("target/path")}>Move</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

// Records what the host handed the `file-actions-menu` slot, and lets a
// test drive the two callbacks an addon menu entry is given.
const slotCalls = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
  /** Mirrors AddonSlot returning null when no addon claims the slot. */
  empty: false,
}));

vi.mock("../AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props?: Record<string, unknown> }) => {
    slotCalls.props.push({ id, ...props });
    if (slotCalls.empty) return null;
    return (
      <div data-testid={`addon-slot-${id}`}>
        <button
          data-testid="addon-open"
          onClick={() => (props?.onDialogOpenChange as (o: boolean) => void)?.(true)}
        >
          open
        </button>
        <button
          data-testid="addon-dialog-close"
          onClick={() => (props?.onDialogOpenChange as (o: boolean) => void)?.(false)}
        >
          dialog close
        </button>
        <button
          data-testid="addon-close"
          onClick={() => (props?.onRequestClose as () => void)?.()}
        >
          close
        </button>
      </div>
    );
  },
}));

const mockFile: FileItem = {
  image_width: null,
  image_height: null,
  id: "file-1",
  filename: "test.mp4",
  title: "Test",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
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

/**
 * Escape reaches the menu through the shortcut stack now, and
 * `AppShell` mounts the provider around every route — so a bare render
 * is a tree the browser never has.
 */
function renderWithStack(ui: React.ReactElement) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

describe("FileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders menu button", () => {
    renderWithStack(<FileActions file={mockFile} />);
    expect(screen.getByLabelText("File actions")).toBeInTheDocument();
  });

  it("carries the touch floor on the button, not on its wrapper", () => {
    // The row's rule is `.file-action-row-touch > *`, and this button is not
    // a direct child of the row — the menu needs a `.relative` wrapper, so
    // the wrapper grew to 44x44 and the button stayed 28x28, measured in a
    // browser before and after that rule was widened to both rows. §Row
    // Actions asks for the class on the control wherever alignment stops it
    // inheriting the height, which is this case.
    //
    // This pins the classes, not the pixels. jsdom lays nothing out, and the
    // shell tests that render this row mock `FileActions` away entirely, so
    // no test in this repository ever sees this button inside that row. The
    // measurement lives in the pull request; what lives here is the hook.
    renderWithStack(<FileActions file={mockFile} />);
    const button = screen.getByLabelText("File actions");
    const tokens = button.className.split(/\s+/);
    expect(tokens).toContain("pointer-coarse:h-11");
    expect(tokens).toContain("pointer-coarse:w-11");
    // `p-1.5` carries no `display`, so the size classes alone leave the glyph
    // against the left padding edge — 6/14/22/14 rather than 14 all round.
    expect(tokens).toContain("inline-flex");
    expect(tokens).toContain("items-center");
    expect(tokens).toContain("justify-center");
  });

  it("exposes the menu to assistive tech", () => {
    renderWithStack(<FileActions file={mockFile} />);
    const trigger = screen.getByLabelText("File actions");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    // The seven this menu shares with the card and list menus. It used
    // to build its own array and had five — no Copy, no Cut, and no
    // "add to collection" at all. See `fileMenuParity.test.tsx`, which
    // compares the three real surfaces rather than this count.
    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
  });

  it("offers add-to-collection, like the card and list menus do", () => {
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(
      screen.getByRole("menuitem", { name: /add to collection/i }),
    ).toBeInTheDocument();
  });

  it("opens menu on click", () => {
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();
  });

  it("opens rename dialog", () => {
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", () => {
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onDelete after successful deletion", async () => {
    const onDelete = vi.fn();
    renderWithStack(<FileActions file={mockFile} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it("calls onUpdate after successful rename", async () => {
    const onUpdate = vi.fn();
    renderWithStack(<FileActions file={mockFile} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});

/**
 * The trigger's box, the menu's height, and nothing else laid out.
 *
 * jsdom lays nothing out, so every rect here is stated. That makes these
 * cases evidence about the *decision* — which corner the component picks
 * for a given pair of boxes — and about nothing geometric. Whether the box
 * the decision names is actually on screen is measured in Chromium by
 * `e2e-layout/file-actions-menu.spec.ts`.
 *
 * The trigger rect carries all four edges: `spaceBelow` is arithmetic on
 * `bottom`, and a rect that omits it makes every comparison `NaN > x`,
 * i.e. `false` — which is a green that no longer depends on the code.
 */
function mountWithBoxes(
  trigger: { top: number; bottom: number; left: number; right: number },
  menuHeight: number,
  // Only consulted when a case renders `<Column>`: nothing else in these
  // trees carries an `overflow`, so the walk finds no clipping ancestor
  // and the frame falls back to the viewport.
  column: { top: number; bottom: number; left: number } = {
    top: 0,
    bottom: 0,
    left: 0,
  },
) {
  // `menuReads` counts how often the decision actually reads the box, so
  // a case can say how many re-derivations one observed change produces.
  const state = { menuHeight, menuReads: 0 };
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if ((this as HTMLElement).classList.contains("relative")) {
        return { ...trigger } as DOMRect;
      }
      if (this.getAttribute("role") === "menu") {
        state.menuReads += 1;
        return { height: state.menuHeight } as DOMRect;
      }
      if (this.getAttribute("data-bounds") === "clip") {
        return { ...column } as DOMRect;
      }
      return original.call(this);
    },
  );
  return state;
}

describe("FileActions menu alignment", () => {
  // The menu hangs left of the trigger, which only holds while the trigger
  // sits near its column's right edge. A wrapped action row or a narrow pane
  // breaks that, and the menu would spill over whatever is to the left.
  //
  // The vertical boxes are stated too, and stated so the menu fits below:
  // these two cases are about the horizontal axis, and leaving the vertical
  // one undefined made them pass on `NaN` rather than on the code.
  function mountAtColumnEdge(triggerRight: number) {
    return mountWithBoxes(
      { top: 100, bottom: 128, left: triggerRight - 28, right: triggerRight },
      200,
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens leftward when the trigger has room to its left", async () => {
    mountAtColumnEdge(300);
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    // By role, not by `.absolute.top-full`: that class list is the answer
    // the vertical decision produced, so locating by it makes a horizontal
    // case fail with "expected undefined" whenever the vertical one moves —
    // and the error toast wears the same two classes.
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("right-0");
    expect(menu.className).not.toContain("left-0");
  });

  it("flips rightward when the menu would spill past the column edge", async () => {
    // Trigger 150px from a column that starts at 0: a 160px menu hung to the
    // left would start at -10.
    mountAtColumnEdge(150);
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    expect(screen.getByRole("menu").className).toContain("left-0");
  });
});

describe("FileActions menu direction", () => {
  /**
   * The menu hangs below the trigger, which needs the menu's own height
   * beneath it. In the Bottom Sheet's resting strip (`fixed bottom-0`)
   * there is none, and the menu was drawn below the viewport.
   *
   * The four cases below are the whole truth table of
   * `(menu fits below, more room above)`. The `(fits, more above)` cell is
   * the one the measured height decides on its own: drop the height term
   * or replace it with a constant and only that cell notices.
   */
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function openAndRead(): string {
    fireEvent.click(screen.getByLabelText("File actions"));
    return screen.getByRole("menu").className;
  }

  function at(top: number, bottom: number, menuHeight: number) {
    mountWithBoxes({ top, bottom, left: 300, right: 328 }, menuHeight);
    renderWithStack(<FileActions file={mockFile} />);
    return openAndRead();
  }

  it("opens downward when the menu fits below the trigger", () => {
    // window.innerHeight is 768 in jsdom: 640px of room under the trigger,
    // and less above it. (fits below, less room above)
    const className = at(100, 128, 200);
    expect(className.includes("top-full")).toBe(true);
    expect(className.includes("bottom-full")).toBe(false);
  });

  it("stays downward when the menu fits below and there is more room above", () => {
    // (fits below, more room above) — 140px under the trigger for a 50px
    // menu plus its 4px gap, against 600px over it. The height is the only
    // term that keeps this downward: with it dropped, or replaced by a
    // constant taller than 136px, `spaceAbove > spaceBelow` carries the
    // expression on its own and the menu flips for no reason.
    const className = at(600, 628, 50);
    expect(className.includes("top-full")).toBe(true);
    expect(className.includes("bottom-full")).toBe(false);
  });

  it("opens upward from the resting strip, where nothing fits below", () => {
    // (does not fit below, more room above) — the 56px strip on the
    // viewport floor: 20px of room under it.
    const className = at(712, 748, 200);
    expect(className.includes("bottom-full")).toBe(true);
    expect(className.includes("top-full")).toBe(false);
  });

  it("stays downward when neither side has room", () => {
    // (does not fit below, less room above) — taller than the viewport, so
    // flipping trades 730px of room for 10px.
    const className = at(10, 38, 900);
    expect(className.includes("top-full")).toBe(true);
    expect(className.includes("bottom-full")).toBe(false);
  });

  // The two sides of the `mt-1` / `mb-1` boundary: 200px of room below the
  // trigger and 540px above it in both cases, so `menuHeight + 4 > 200` is
  // the entire difference between them. Drop the gap from the arithmetic
  // and the first one keeps its last 2px past the edge, green.
  it("flips when the box fits below but the gap it needs does not", () => {
    expect(at(540, 568, 198).includes("bottom-full")).toBe(true);
  });

  it("stays downward when the box and its gap both fit", () => {
    expect(at(540, 568, 194).includes("top-full")).toBe(true);
  });
});

describe("FileActions menu direction, as the menu's own height moves", () => {
  /**
   * `AddonSlot` resolves a dynamic `import()` inside an effect and renders
   * null until it lands, so the menu measured on the commit that opens it
   * is a menu with no addon rows in it — exactly the wrong number the
   * commit rejects a guessed row count for being. The decision has to
   * follow the box, not sample it once.
   *
   * Stated: this pins the re-derivation, not the geometry. That the two
   * directions are the same height — which is why an observer keyed on
   * size cannot oscillate — is measured in Chromium by
   * `e2e-layout/file-actions-menu.spec.ts`.
   */
  let fireResize: (() => void) | undefined;

  beforeEach(() => {
    fireResize = undefined;
    class ResizeObserverMock {
      constructor(callback: () => void) {
        fireResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-decides when the addon slot lands and makes the menu taller", () => {
    // 300px under the trigger. The core rows are 150px and fit; one addon
    // entry takes the menu to 450px, which does not.
    const state = mountWithBoxes(
      { top: 440, bottom: 468, left: 300, right: 328 },
      150,
    );
    renderWithStack(
      <FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />,
    );
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(screen.getByRole("menu").className).toContain("top-full");

    state.menuHeight = 450;
    act(() => fireResize!());

    expect(screen.getByRole("menu").className).toContain("bottom-full");
    expect(screen.getByRole("menu").className).not.toContain("top-full");
  });

  it("derives the direction once per observed change, not once per flip", () => {
    // The observer is keyed on the menu's size, and flipping moves the box
    // without resizing it — so one height change is one re-derivation. If
    // the flip fed back into the measurement this count would climb.
    const state = mountWithBoxes(
      { top: 440, bottom: 468, left: 300, right: 328 },
      150,
    );
    state.menuReads = 0;
    renderWithStack(
      <FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />,
    );
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(state.menuReads).toBe(1);

    state.menuHeight = 450;
    act(() => fireResize!());

    expect(screen.getByRole("menu").className).toContain("bottom-full");
    expect(state.menuReads).toBe(2);
  });
});

/**
 * A scrolling column around the menu, so the walk has something to find.
 *
 * The two longhands, not the `overflow` shorthand: the decision reads
 * `overflowX` / `overflowY`, and jsdom's `getComputedStyle` leaves both
 * empty when only the shorthand is set — which would make this column
 * invisible to the walk and every case below a viewport case wearing a
 * column's name. Its box is stated like every other rect here; jsdom lays
 * nothing out.
 */
function Column({ children }: { children: React.ReactNode }) {
  return (
    <div data-bounds="clip" style={{ overflowX: "auto", overflowY: "auto" }}>
      {children}
    </div>
  );
}

describe("FileActions menu direction, against the frame that clips it", () => {
  /**
   * Both axes resolve against the same box: the first ancestor that clips,
   * and the visual viewport only when there is none. The horizontal axis
   * has always said so ("what matters is the enclosing column, not the
   * viewport"); these cases are what stops the vertical one drifting back
   * to `window.innerHeight`, which answers a different question.
   *
   * Unit C puts this menu inside an `overflow-auto` scroller, so the two
   * frames stop agreeing on the running app rather than only here.
   */
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function openInColumn(
    trigger: { top: number; bottom: number; left: number; right: number },
    menuHeight: number,
    column: { top: number; bottom: number; left: number },
  ) {
    mountWithBoxes(trigger, menuHeight, column);
    renderWithStack(
      <Column>
        <FileActions file={mockFile} />
      </Column>,
    );
    fireEvent.click(screen.getByLabelText("File actions"));
    return screen.getByRole("menu").className;
  }

  it("flips where the column ends, not where the window does", () => {
    // 300px under the trigger in the window and 32px in the column. A
    // 100px menu fits the first and not the second, and the column is what
    // it is drawn inside.
    const className = openInColumn(
      { top: 440, bottom: 468, left: 300, right: 328 },
      100,
      { top: 300, bottom: 500, left: 0 },
    );
    expect(className.includes("bottom-full")).toBe(true);
    expect(className.includes("top-full")).toBe(false);
  });

  it("measures the room above from the column's top, not the window's", () => {
    // 140px above the trigger inside the column against 440px above it in
    // the window, and 200px below. Neither side fits a 300px menu, so the
    // answer turns entirely on which of the two the space above is
    // compared with: from the column it is the smaller side and the menu
    // stays down.
    const className = openInColumn(
      { top: 440, bottom: 468, left: 300, right: 328 },
      300,
      { top: 300, bottom: 668, left: 0 },
    );
    expect(className.includes("top-full")).toBe(true);
    expect(className.includes("bottom-full")).toBe(false);
  });

  it("flips sideways at the column's left edge, not the window's", () => {
    // A column starting 200px in. The trigger's right edge is at 300, so a
    // 160px menu hung leftward starts at 140 — inside the window and 60px
    // outside the column it is drawn in.
    const className = openInColumn(
      { top: 100, bottom: 128, left: 272, right: 300 },
      100,
      { top: 0, bottom: 768, left: 200 },
    );
    expect(className.includes("left-0")).toBe(true);
    expect(className.includes("right-0")).toBe(false);
  });

  it("measures the window against what is visible, not the layout viewport", () => {
    // No clipping ancestor, so the frame is the window — and on a phone an
    // on-screen keyboard shrinks what is visible without moving
    // `window.innerHeight`. 440px below the trigger by the layout viewport,
    // 72px by the visual one, for a 100px menu. The rename dialog raises
    // the keyboard on this very surface.
    vi.stubGlobal("visualViewport", { height: 400 });
    mountWithBoxes({ top: 300, bottom: 328, left: 300, right: 328 }, 100);
    renderWithStack(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    const className = screen.getByRole("menu").className;
    expect(className.includes("bottom-full")).toBe(true);
    expect(className.includes("top-full")).toBe(false);
  });
});

describe("FileActions error toast", () => {
  /**
   * The toast hangs off the same trigger as the menu and is raised after
   * the menu has closed, so it inherits both of the menu's decisions —
   * `DESIGN.md` §Context Menus / Dropdowns, "anything else anchored to the
   * same trigger flips with it". Neither flag may be cleared on close, or
   * the message lands in the corner the menu was not allowed to use.
   *
   * Both corners are declared, not derived: a test that only ever asserted
   * the flipped one would stay green on a toast that flipped always.
   */
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(deleteFile).mockResolvedValue(undefined);
  });

  async function raiseToast(
    trigger: { top: number; bottom: number; left: number; right: number },
  ) {
    mountWithBoxes(trigger, 200);
    vi.mocked(deleteFile).mockRejectedValue(new Error("nope"));
    renderWithStack(<FileActions file={mockFile} />);

    fireEvent.click(screen.getByLabelText("File actions"));
    // Reads the menu's own answer first, so a toast asserted to match it
    // cannot pass by both being wrong in the same way.
    const menuClassName = screen.getByRole("menu").className;

    fireEvent.click(screen.getByText("Move to Trash"));
    fireEvent.click(screen.getByText("Confirm"));
    const toast = await screen.findByText("Failed to delete");
    return { menuClassName, toastClassName: toast.className };
  }

  it("hangs from the corner the menu used, on the resting strip", async () => {
    // Trigger 150px from the column's left edge on the viewport floor: the
    // menu goes up and to the right, and this box is `whitespace-nowrap`
    // and wider than the menu, so both flips matter to it.
    const { menuClassName, toastClassName } = await raiseToast({
      top: 712,
      bottom: 748,
      left: 122,
      right: 150,
    });

    expect(menuClassName).toContain("bottom-full");
    expect(menuClassName).toContain("left-0");
    expect(toastClassName).toContain("bottom-full");
    expect(toastClassName).not.toContain("top-full");
    expect(toastClassName).toContain("left-0");
    expect(toastClassName).not.toContain("right-0");
  });

  it("hangs below and to the right where the menu did", async () => {
    const { menuClassName, toastClassName } = await raiseToast({
      top: 100,
      bottom: 128,
      left: 300,
      right: 328,
    });

    expect(menuClassName).toContain("top-full");
    expect(menuClassName).toContain("right-0");
    expect(toastClassName).toContain("top-full");
    expect(toastClassName).not.toContain("bottom-full");
    expect(toastClassName).toContain("right-0");
    expect(toastClassName).not.toContain("left-0");
  });
});

describe("FileActions file-actions-menu slot", () => {
  beforeEach(() => {
    slotCalls.props = [];
    slotCalls.empty = false;
  });

  function openMenu() {
    fireEvent.click(screen.getByLabelText("File actions"));
  }

  it("renders no slot without addonProps", () => {
    // A call site with no file context to give gets no addon entries.
    renderWithStack(<FileActions file={mockFile} />);
    openMenu();

    expect(
      screen.queryByTestId("addon-slot-file-actions-menu"),
    ).not.toBeInTheDocument();
    expect(slotCalls.props).toHaveLength(0);
  });

  it("forwards addonProps plus the two callbacks", () => {
    renderWithStack(
      <FileActions file={mockFile} addonProps={{ fileId: mockFile.id, drive: "main" }} />,
    );
    openMenu();

    expect(screen.getByTestId("addon-slot-file-actions-menu")).toBeInTheDocument();

    const passed = slotCalls.props.at(-1)!;
    expect(passed.fileId).toBe(mockFile.id);
    expect(passed.drive).toBe("main");
    expect(typeof passed.onRequestClose).toBe("function");
    expect(typeof passed.onDialogOpenChange).toBe("function");
  });

  it("keeps the menu open while an addon dialog is open", () => {
    // An addon's dialog is portalled to document.body, so the host's
    // outside-click listener sees it as a click outside the menu. Were the
    // menu to close, the slot subtree — and the dialog with it — would
    // unmount mid-interaction.
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.mouseDown(document.body);

    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByTestId("addon-slot-file-actions-menu")).toBeInTheDocument();
  });

  it("closes on an outside click while no addon dialog is open", () => {
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("addon-slot-file-actions-menu"),
    ).not.toBeInTheDocument();
  });

  it("closes when an addon calls onRequestClose", () => {
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-close"));

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("addon-slot-file-actions-menu"),
    ).not.toBeInTheDocument();
    // The entry holding focus unmounts with the menu, so the host has to
    // put focus back or it falls to <body>.
    expect(screen.getByLabelText("File actions")).toHaveFocus();
  });

  it("leaves no dangling separator when the slot renders nothing", () => {
    // No addon claims this slot on a stock install, and an entry that does
    // claim it may still render nothing for a given file. The separator
    // rides on the wrapper so `empty:hidden` takes it away too — assert the
    // wrapper really is childless, which is what `:empty` keys off.
    slotCalls.empty = true;
    const { container } = renderWithStack(
      <FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />,
    );
    openMenu();

    const wrapper = container.querySelector('[class*="empty:hidden"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.childElementCount).toBe(0);
  });

  it("recovers when an addon closes the menu without clearing its dialog flag", () => {
    // `onDialogOpenChange(false)` is the addon's job and lives in another
    // repository. If it is skipped, the flag must not survive the menu and
    // leave `anyDialogOpen` stuck true — that would wedge the outside-click
    // and Escape listeners off for every later open.
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.click(screen.getByTestId("addon-close"));
    expect(screen.queryByText("Download")).not.toBeInTheDocument();

    openMenu();
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });

  it("resumes dismissing the menu once an addon reports its dialog closed", () => {
    // The other half of the guard: the listeners stand down while the
    // dialog is up, and must come back when it goes away — otherwise the
    // menu survives every outside click for the rest of its life.
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.mouseDown(document.body);
    expect(screen.getByText("Download")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("addon-dialog-close"));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(screen.getByLabelText("File actions")).toHaveFocus();
  });

  it("leaves Escape to the addon while its dialog is open", () => {
    renderWithStack(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByText("Download")).toBeInTheDocument();
  });
});
