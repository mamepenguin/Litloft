import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { AddButton, ADD_MENU_SLOT } from "@/components/AddButton";
import { ShortcutsProvider } from "../ShortcutsProvider";

const slotEntries = { current: 0 };
/**
 * An addon whose feature is off for this drive still declares the slot and
 * renders nothing.
 */
const slotDraws = { current: true as boolean | "whitespace" };
const addonSlotCalls: Array<Record<string, unknown>> = [];

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: (props: Record<string, unknown>) => {
    addonSlotCalls.push(props);
    if (slotDraws.current === "whitespace") return <>{" "}</>;
    return slotDraws.current ? <button role="menuitem">addon row</button> : null;
  },
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    hasSlot: () => slotEntries.current > 0,
  }),
}));

const open = () => fireEvent.click(screen.getByRole("button", { name: "Add" }));

describe("AddButton", () => {
  beforeEach(() => {
    slotEntries.current = 0;
    slotDraws.current = true;
    addonSlotCalls.length = 0;
  });
  afterEach(cleanup);

  it("shows its label at every width", () => {
    render(<AddButton />);
    const trigger = screen.getByRole("button", { name: "Add" });
    expect(trigger).toHaveTextContent("Add");
    // `getAttribute`, not `el.className`: an `<svg>`'s `className` is an
    // `SVGAnimatedString`.
    for (const el of trigger.querySelectorAll("[class]")) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).not.toContain("hidden");
    }
  });

  it("closes on Escape and returns focus to the trigger", () => {
    // Focus is moved into the menu before the press: with focus already on
    // the trigger, `toHaveFocus` passes whether or not the handler restores it.
    render(
      <ShortcutsProvider>
        <AddButton />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Add/ });
    fireEvent.click(trigger);
    const row = screen.getAllByRole("menuitem")[0];
    row.focus();
    expect(row).toHaveFocus();

    fireEvent.keyDown(row, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });


  it("closes on Escape even with focus in a text field", () => {
    // Nothing traps focus inside these menus, so Tab can walk out into a
    // field that `ShortcutsProvider` treats as "editing".
    render(
      <ShortcutsProvider>
        <AddButton />
        <input aria-label="elsewhere" />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const field = screen.getByLabelText("elsewhere");
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps every way of adding behind the one control", () => {
    render(<AddButton />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    open();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Folder")).toBeInTheDocument();
  });

  it("offers new folder and new note only when handed a handler", () => {
    render(<AddButton />);
    open();
    expect(screen.queryByText("New Folder")).not.toBeInTheDocument();
    expect(screen.queryByText("New Note")).not.toBeInTheDocument();
    cleanup();

    render(<AddButton onCreateFolder={vi.fn()} onCreateFile={vi.fn()} />);
    open();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.getByText("New Note")).toBeInTheDocument();
  });

  it("closes the menu when a row is chosen", () => {
    const onCreateFolder = vi.fn();
    render(<AddButton onCreateFolder={onCreateFolder} />);
    open();
    fireEvent.click(screen.getByText("New Folder"));
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each(["Files", "Folder", "New Folder", "New Note"])(
    "returns focus to the trigger after %s",
    (label) => {
      render(<AddButton onCreateFolder={vi.fn()} onCreateFile={vi.fn()} />);
      const trigger = screen.getByRole("button", { name: "Add" });
      open();
      const row = screen.getByText(label);
      act(() => (row as HTMLElement).focus());
      fireEvent.click(row);
      expect(document.activeElement).toBe(trigger);
    },
  );

  describe("which edge the menu grows from", () => {
    const openPanel = () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      return screen.getByRole("menu");
    };

    it("grows rightward from the left edge by default", () => {
      render(<AddButton />);
      const classes = openPanel().getAttribute("class")!.split(/\s+/);
      expect(classes).toContain("left-0");
      expect(classes).toContain("origin-top-left");
      expect(classes).not.toContain("right-0");
    });

    it("grows leftward from the right edge when asked", () => {
      render(<AddButton align="right" />);
      const classes = openPanel().getAttribute("class")!.split(/\s+/);
      expect(classes).toContain("right-0");
      expect(classes).toContain("origin-top-right");
      expect(classes).not.toContain("left-0");
    });
  });

  describe("the addon rows", () => {
    it("renders none without folder context, even when an addon is installed", () => {
      slotEntries.current = 1;
      render(<AddButton />);
      open();
      expect(addonSlotCalls).toHaveLength(0);
      expect(screen.queryByText("addon row")).not.toBeInTheDocument();
    });

    const rule = () =>
      screen.getByRole("menu").querySelector<HTMLElement>(".border-t");

    it("renders none when no addon has declared the slot", () => {
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(addonSlotCalls).toHaveLength(0);
      expect(rule()).toBeNull();
    });

    it("renders them under a rule when both are true", () => {
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d", fileIds: ["a"] }} />);
      open();
      expect(screen.getByText("addon row")).toBeInTheDocument();
      expect(rule()).not.toBeNull();
      expect(rule()!.childElementCount).toBe(1);
    });

    it("takes the rule away with the rows, when a declared entry draws nothing", () => {
      // `:empty`, not `childElementCount`: CSS counts nodes, so a text node
      // keeps a box non-empty while `childElementCount` still reads 0.
      slotEntries.current = 1;
      slotDraws.current = false;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(screen.queryByText("addon row")).not.toBeInTheDocument();
      expect(rule()!.matches(":empty")).toBe(true);
      expect(rule()!.className.split(/\s+/)).toContain("empty:hidden");
    });

    it("cannot take the rule away from an entry that renders whitespace", () => {
      slotEntries.current = 1;
      slotDraws.current = "whitespace";
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(rule()!.childElementCount).toBe(0);
      expect(rule()!.matches(":empty")).toBe(false);
    });

    it("keeps the rule out of the menu's role tree", () => {
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(rule()).toHaveAttribute("role", "none");
    });

    it("asks a slot of its own, not the toolbar's standalone one", () => {
      // Same id would mean an entry written as a button gets drawn inside a
      // `role="menu"`.
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(ADD_MENU_SLOT).toBe("folder-actions-menu");
      expect(addonSlotCalls[0].id).toBe(ADD_MENU_SLOT);
      expect(addonSlotCalls[0].id).not.toBe("folder-actions");
    });

    it("returns focus to the trigger when an entry asks to close", () => {
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d" }} />);
      const trigger = screen.getByRole("button", { name: "Add" });
      open();
      const props = addonSlotCalls[0].props as Record<string, unknown>;
      act(() => (props.onRequestClose as () => void)());
      expect(document.activeElement).toBe(trigger);
    });

    it("keeps onRequestClose for itself", () => {
      slotEntries.current = 1;
      const theirs = vi.fn();
      render(
        <AddButton addonProps={{ drive: "d", onRequestClose: theirs }} />,
      );
      open();
      const props = addonSlotCalls[0].props as Record<string, unknown>;
      expect(props.onRequestClose).not.toBe(theirs);
      act(() => (props.onRequestClose as () => void)());
      expect(theirs).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("forwards the folder context and a way to close the menu", () => {
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d", fileIds: ["a"], path: "p" }} />);
      open();
      const props = addonSlotCalls[0].props as Record<string, unknown>;
      expect(props.drive).toBe("d");
      expect(props.fileIds).toEqual(["a"]);
      expect(props.path).toBe("p");

      act(() => (props.onRequestClose as () => void)());
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("caps its own height and scrolls, like the bar's other menus", () => {
    // `useMenuSurface` is not reused: its classes are `sm:`-scoped because
    // that surface is a sheet below 640px, and this menu is anchored at
    // every width.
    render(<AddButton />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const classes = [...screen.getByRole("menu").classList];
    expect(classes).toContain("max-h-[60vh]");
    expect(classes).toContain("sm:max-h-[70vh]");
    expect(classes).toContain("overflow-y-auto");
  });
});
