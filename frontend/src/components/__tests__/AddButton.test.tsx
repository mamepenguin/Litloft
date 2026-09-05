import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { AddButton, ADD_MENU_SLOT } from "@/components/AddButton";

const slotEntries = { current: 0 };
const addonSlotCalls: Array<Record<string, unknown>> = [];

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: (props: Record<string, unknown>) => {
    addonSlotCalls.push(props);
    return <button role="menuitem">addon row</button>;
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
    addonSlotCalls.length = 0;
  });
  afterEach(cleanup);

  it("shows its label at every width", () => {
    // The mobile rule is fewer controls, not nameless ones (00-basis
    // モバイルの寸法規則), so nothing inside the trigger is `hidden`. jsdom
    // applies no stylesheet, so this reads the class rather than the layout.
    render(<AddButton />);
    const trigger = screen.getByRole("button", { name: "Add" });
    expect(trigger).toHaveTextContent("Add");
    for (const el of trigger.querySelectorAll("[class]")) {
      expect(el.className.toString().split(/\s+/)).not.toContain("hidden");
    }
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

  describe("the addon rows", () => {
    it("renders none without folder context, even when an addon is installed", () => {
      slotEntries.current = 1;
      render(<AddButton />);
      open();
      expect(addonSlotCalls).toHaveLength(0);
      expect(screen.queryByText("addon row")).not.toBeInTheDocument();
    });

    it("renders none when no addon has declared the slot", () => {
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(addonSlotCalls).toHaveLength(0);
      // Nor the divider that would otherwise hang below the last row.
      expect(
        screen.getByRole("menu").querySelectorAll(".border-t"),
      ).toHaveLength(0);
    });

    it("renders them under a divider when both are true", () => {
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d", fileIds: ["a"] }} />);
      open();
      expect(screen.getByText("addon row")).toBeInTheDocument();
      expect(
        screen.getByRole("menu").querySelectorAll(".border-t"),
      ).toHaveLength(1);
    });

    it("asks a slot of its own, not the toolbar's standalone one", () => {
      // Same id would mean an entry written as a button gets drawn inside a
      // `role="menu"`, and every addon on the old slot would break the day
      // this shipped rather than on the day it moved.
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(ADD_MENU_SLOT).toBe("folder-actions-menu");
      expect(addonSlotCalls[0].id).toBe(ADD_MENU_SLOT);
      expect(addonSlotCalls[0].id).not.toBe("folder-actions");
    });

    it("keeps onRequestClose for itself", () => {
      // Reserved, as `FileActions` reserves it: an entry that supplied its
      // own would silently take over closing the host's menu. Applied after
      // the context is spread, so the host's wins.
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
});
