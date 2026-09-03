import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileActions } from "../FileActions";
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

describe("FileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders menu button", () => {
    render(<FileActions file={mockFile} />);
    expect(screen.getByLabelText("File actions")).toBeInTheDocument();
  });

  it("exposes the menu to assistive tech", () => {
    render(<FileActions file={mockFile} />);
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
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(
      screen.getByRole("menuitem", { name: /add to collection/i }),
    ).toBeInTheDocument();
  });

  it("opens menu on click", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();
  });

  it("opens rename dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onDelete after successful deletion", async () => {
    const onDelete = vi.fn();
    render(<FileActions file={mockFile} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it("calls onUpdate after successful rename", async () => {
    const onUpdate = vi.fn();
    render(<FileActions file={mockFile} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});

describe("FileActions menu alignment", () => {
  // The menu hangs left of the trigger, which only holds while the trigger
  // sits near its column's right edge. A wrapped action row or a narrow pane
  // breaks that, and the menu would spill over whatever is to the left.
  function mountWithBounds(triggerRight: number, clipLeft: number) {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-bounds") === "clip") {
          return { left: clipLeft, right: clipLeft + 300 } as DOMRect;
        }
        if ((this as HTMLElement).classList.contains("relative")) {
          return { left: triggerRight - 28, right: triggerRight } as DOMRect;
        }
        return original.call(this);
      },
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens leftward when the trigger has room to its left", async () => {
    mountWithBounds(300, 0);
    const { container } = render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    const menu = container.querySelector(".absolute.top-full");
    expect(menu?.className).toContain("right-0");
    expect(menu?.className).not.toContain("left-0");
  });

  it("flips rightward when the menu would spill past the column edge", async () => {
    // Trigger 150px from a column that starts at 0: a 160px menu hung to the
    // left would start at -10.
    mountWithBounds(150, 0);
    const { container } = render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    const menu = container.querySelector(".absolute.top-full");
    expect(menu?.className).toContain("left-0");
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
    render(<FileActions file={mockFile} />);
    openMenu();

    expect(
      screen.queryByTestId("addon-slot-file-actions-menu"),
    ).not.toBeInTheDocument();
    expect(slotCalls.props).toHaveLength(0);
  });

  it("forwards addonProps plus the two callbacks", () => {
    render(
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
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.mouseDown(document.body);

    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByTestId("addon-slot-file-actions-menu")).toBeInTheDocument();
  });

  it("closes on an outside click while no addon dialog is open", () => {
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("addon-slot-file-actions-menu"),
    ).not.toBeInTheDocument();
  });

  it("closes when an addon calls onRequestClose", () => {
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
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
    const { container } = render(
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
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
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
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.mouseDown(document.body);
    expect(screen.getByText("Download")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("addon-dialog-close"));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(screen.getByLabelText("File actions")).toHaveFocus();
  });

  it("leaves Escape to the addon while its dialog is open", () => {
    render(<FileActions file={mockFile} addonProps={{ fileId: mockFile.id }} />);
    openMenu();

    fireEvent.click(screen.getByTestId("addon-open"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByText("Download")).toBeInTheDocument();
  });
});
