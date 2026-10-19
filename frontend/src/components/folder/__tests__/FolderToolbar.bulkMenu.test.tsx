import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { FolderToolbar, BULK_ACTIONS_MENU_SLOT } from "../FolderToolbar";
import { ADD_MENU_SLOT } from "@/components/AddButton";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";

/** A layer beneath the toolbar that wants Escape, like the phone sidebar drawer. */
function EscapeLayer({ onEscape }: { onEscape: () => void }) {
  useShortcuts(
    "test-layer",
    "Dialog",
    [{ key: "escape", label: "Close", editingOnly: false, hidden: true, handler: onEscape }],
    true,
    0,
  );
  return null;
}

const declared = new Set<string>();
/** What the `…` slot draws: rows, nothing, or a row that raises a portalled dialog. */
const draws = { current: "rows" as "rows" | "nothing" | "dialog" };
const slotCalls: Array<{ id: string; props: Record<string, unknown> }> = [];

vi.mock("@/components/AddonSlot", async () => {
  const { createPortal } = await import("react-dom");
  return {
    AddonSlot: ({ id, props }: { id: string; props: Record<string, unknown> }) => {
      slotCalls.push({ id, props });
      if (id !== "folder-bulk-actions-menu") return null;
      if (draws.current === "nothing") return null;
      if (draws.current === "dialog") {
        const setDialog = props.onDialogOpenChange as (open: boolean) => void;
        return (
          <>
            <button role="menuitem" onClick={() => setDialog(true)}>
              open dialog
            </button>
            {createPortal(
              <div role="dialog">
                <input aria-label="dialog field" />
                <button onClick={() => setDialog(false)}>dismiss dialog</button>
              </div>,
              document.body,
            )}
          </>
        );
      }
      return <button role="menuitem">bulk row</button>;
    },
  };
});

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: (id: string) => declared.has(id) }),
}));

const baseProps = {
  isSpecialView: false,
  isWriteDestination: true,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 2,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1", "file-2"],
  drive: "test-drive",
  folderPath: "movies",
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
  onTogglePin: vi.fn(),
  isPinned: false,
};

type Props = Parameters<typeof FolderToolbar>[0];

function renderToolbar(overrides: Partial<Props> = {}) {
  render(
    <ShortcutsProvider>
      <FolderToolbar {...baseProps} {...overrides} />
      <p>outside</p>
    </ShortcutsProvider>,
  );
  return screen.getByRole("button", { name: "More actions" });
}

const openMore = (trigger: HTMLElement) => fireEvent.click(trigger);
const menu = () => screen.queryByRole("menu");
const bulkCalls = () => slotCalls.filter((c) => c.id === BULK_ACTIONS_MENU_SLOT);
const lastBulkProps = () => bulkCalls().at(-1)!.props;
const rule = () =>
  menu()?.querySelector(":scope > [role='none'].border-t") as HTMLElement | null;
const pressOn = (el: Element) => fireEvent.pointerDown(el, { button: 0 });
const escapeOn = (el: Element) => fireEvent.keyDown(el, { key: "Escape" });

beforeEach(() => {
  declared.clear();
  declared.add(BULK_ACTIONS_MENU_SLOT);
  draws.current = "rows";
  slotCalls.length = 0;
});
afterEach(cleanup);

describe("FolderToolbar's … menu as a host for bulk actions", () => {
  it("has its own slot id, distinct from the Add menu's", () => {
    expect(BULK_ACTIONS_MENU_SLOT).toBe("folder-bulk-actions-menu");
    expect(BULK_ACTIONS_MENU_SLOT).not.toBe(ADD_MENU_SLOT);
  });

  it("asks for the slot only once the menu is open", () => {
    const trigger = renderToolbar();
    expect(bulkCalls()).toHaveLength(0);
    openMore(trigger);
    expect(bulkCalls().length).toBeGreaterThan(0);
    expect(screen.getByRole("menuitem", { name: "bulk row" })).toBeInTheDocument();
  });

  it("places the rows after the core rows", () => {
    openMore(renderToolbar());
    const names = screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
    expect(names.slice(-4)).toEqual(["Selection mode", "Rescan", "Pin this folder", "bulk row"]);
  });

  it.each([
    ["not a write destination", { isWriteDestination: false }],
    ["search results", { isWriteDestination: false, isSearch: true }],
    ["a special view", { isWriteDestination: false, isSpecialView: true }],
  ])("offers nothing on %s", (_, overrides) => {
    openMore(renderToolbar(overrides));
    expect(bulkCalls()).toHaveLength(0);
    expect(rule()).toBeNull();
  });

  it("draws no rule when no addon declared the slot", () => {
    declared.clear();
    openMore(renderToolbar());
    expect(bulkCalls()).toHaveLength(0);
    expect(rule()).toBeNull();
  });

  it("takes the rule away with the rows when a declared entry draws nothing", () => {
    draws.current = "nothing";
    openMore(renderToolbar());
    expect(rule()).not.toBeNull();
    expect(rule()!.className.split(/\s+/)).toContain("empty:hidden");
    expect(rule()!.childNodes).toHaveLength(0);
  });

  it("forwards the listing context", () => {
    openMore(renderToolbar());
    expect(lastBulkProps()).toMatchObject({
      drive: "test-drive",
      path: "movies",
      fileIds: ["file-1", "file-2"],
      surface: "library",
    });
  });

  it("passes the drive root as an empty path", () => {
    openMore(renderToolbar({ folderPath: "", onTogglePin: undefined }));
    expect(lastBulkProps().path).toBe("");
  });

  it("returns focus to the trigger when an entry asks to close", () => {
    const trigger = renderToolbar();
    openMore(trigger);
    act(() => (lastBulkProps().onRequestClose as () => void)());
    expect(menu()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([["Selection mode"], ["Rescan"], ["Pin this folder"]])(
    "returns focus to the trigger when %s is chosen",
    (name) => {
      const trigger = renderToolbar();
      openMore(trigger);
      fireEvent.click(screen.getByRole("menuitem", { name }));
      expect(menu()).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    },
  );

  it("closes on Escape and returns focus to the trigger", () => {
    const trigger = renderToolbar();
    openMore(trigger);
    const row = screen.getByRole("menuitem", { name: "bulk row" });
    row.focus();
    escapeOn(row);
    expect(menu()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape even with focus in a text field", () => {
    const trigger = renderToolbar();
    openMore(trigger);
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    escapeOn(field);
    field.remove();
    expect(menu()).not.toBeInTheDocument();
  });

  it("leaves Escape to the layer beneath while the menu is closed", () => {
    const onEscape = vi.fn();
    render(
      <ShortcutsProvider>
        <EscapeLayer onEscape={onEscape} />
        <FolderToolbar {...baseProps} />
      </ShortcutsProvider>,
    );
    escapeOn(document.body);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("keeps Escape from a layer that registers after the menu opened", () => {
    const onEscape = vi.fn();
    function Harness({ late }: { late: boolean }) {
      return (
        <ShortcutsProvider>
          <FolderToolbar {...baseProps} />
          {late && <EscapeLayer onEscape={onEscape} />}
        </ShortcutsProvider>
      );
    }
    const { rerender } = render(<Harness late={false} />);
    openMore(screen.getByRole("button", { name: "More actions" }));
    rerender(<Harness late />);
    escapeOn(document.body);
    expect(menu()).not.toBeInTheDocument();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("answers an Escape in the New Folder field once, from the field", () => {
    const onSetCreatingFolder = vi.fn();
    const trigger = renderToolbar({ creatingFolder: true, onSetCreatingFolder });
    openMore(trigger);
    const field = screen.getAllByRole("textbox")[0];
    field.focus();
    escapeOn(field);
    expect(onSetCreatingFolder).toHaveBeenCalledWith(false);
    expect(menu()).toBeInTheDocument();
    expect(document.activeElement).toBe(field);
  });

  describe("an entry's dialog", () => {
    const openDialog = () => {
      draws.current = "dialog";
      const trigger = renderToolbar();
      openMore(trigger);
      fireEvent.click(screen.getByText("open dialog"));
      return trigger;
    };

    it("is outside the menu, so the press test is real", () => {
      openDialog();
      expect(menu()!.contains(screen.getByRole("dialog"))).toBe(false);
    });

    it("keeps the menu open on a press outside while reported, and not after", () => {
      openDialog();
      pressOn(screen.getByText("outside"));
      expect(menu()).toBeInTheDocument();

      fireEvent.click(screen.getByText("dismiss dialog"));
      pressOn(screen.getByText("outside"));
      expect(menu()).not.toBeInTheDocument();
    });

    it("does not answer Escape while reported, and does once dismissed", () => {
      const trigger = openDialog();
      const field = screen.getByLabelText("dialog field");
      field.focus();
      escapeOn(field);
      expect(menu()).toBeInTheDocument();

      fireEvent.click(screen.getByText("dismiss dialog"));
      screen.getByText("open dialog").focus();
      escapeOn(screen.getByText("open dialog"));
      expect(menu()).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("lets Escape through to the layer beneath while reported", () => {
      const onEscape = vi.fn();
      draws.current = "dialog";
      render(
        <ShortcutsProvider>
          <EscapeLayer onEscape={onEscape} />
          <FolderToolbar {...baseProps} />
        </ShortcutsProvider>,
      );
      openMore(screen.getByRole("button", { name: "More actions" }));
      fireEvent.click(screen.getByText("open dialog"));
      escapeOn(screen.getByLabelText("dialog field"));
      expect(onEscape).toHaveBeenCalledTimes(1);
      expect(menu()).toBeInTheDocument();
    });

    it("does not survive the trigger closing the menu", () => {
      const trigger = openDialog();
      fireEvent.click(trigger);
      expect(menu()).not.toBeInTheDocument();
      openMore(trigger);
      escapeOn(trigger);
      expect(menu()).not.toBeInTheDocument();
    });

    it("does not survive the menu closing", () => {
      const trigger = openDialog();
      act(() => (lastBulkProps().onRequestClose as () => void)());
      openMore(trigger);
      pressOn(screen.getByText("outside"));
      expect(menu()).not.toBeInTheDocument();
    });
  });
});
