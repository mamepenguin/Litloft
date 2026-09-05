import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { AddButton, ADD_MENU_SLOT } from "@/components/AddButton";

const slotEntries = { current: 0 };
/**
 * Whether the entry behind the slot draws anything *here*.
 *
 * Declaring a slot and filling it are different questions, and the gap
 * between them is a designed state: an addon whose feature is switched
 * off for this drive still declares the slot and still renders nothing
 * (`.claude/rules/design-decisions.md`, Addons: scope and policy).
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
    // The mobile rule is fewer controls, not nameless ones (00-basis
    // モバイルの寸法規則), so nothing inside the trigger is `hidden`. jsdom
    // applies no stylesheet, so this reads the class rather than the layout.
    render(<AddButton />);
    const trigger = screen.getByRole("button", { name: "Add" });
    expect(trigger).toHaveTextContent("Add");
    // `getAttribute`, not `el.className`: the icons here are `<svg>`, whose
    // `className` is an `SVGAnimatedString` that stringifies to
    // "[object SVGAnimatedString]" — every class on them read as none.
    for (const el of trigger.querySelectorAll("[class]")) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).not.toContain("hidden");
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

  it.each(["Files", "Folder", "New Folder", "New Note"])(
    "returns focus to the trigger after %s",
    (label) => {
      // The chosen row unmounts with the menu. Without this, focus lands on
      // <body> and a keyboard user is put back at the top of the document.
      // Every row, not the one that happened to be checked: they close
      // through one path so that this cannot be true of only some of them.
      render(<AddButton onCreateFolder={vi.fn()} onCreateFile={vi.fn()} />);
      const trigger = screen.getByRole("button", { name: "Add" });
      open();
      const row = screen.getByText(label);
      act(() => (row as HTMLElement).focus());
      fireEvent.click(row);
      expect(document.activeElement).toBe(trigger);
    },
  );

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
      // Nor the rule that would otherwise hang below the last row.
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
      // The rule is the wrapper's own border rather than a sibling, so
      // `empty:hidden` removes both at once. jsdom loads no stylesheet, so
      // this asserts the mechanism — an empty box carrying that class —
      // rather than the pixels.
      //
      // `:empty`, not `childElementCount`. They are not the same predicate:
      // CSS counts *nodes*, so a text node keeps a box non-empty while
      // `childElementCount` still reads 0. Asserted the way the browser
      // decides, or this test cannot tell the working case from the broken
      // one (jsdom's nwsapi implements `:empty` to the CSS 3 definition).
      slotEntries.current = 1;
      slotDraws.current = false;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(screen.queryByText("addon row")).not.toBeInTheDocument();
      expect(rule()!.matches(":empty")).toBe(true);
      expect(rule()!.className.split(/\s+/)).toContain("empty:hidden");
    });

    it("cannot take the rule away from an entry that renders whitespace", () => {
      // The boundary of the CSS mechanism, asserted so it is a known
      // property rather than a surprise: `:empty` is about nodes, and a
      // literal `{" "}` is a node. `docs/ADDON-DEVELOPMENT.md` tells
      // entries to return `null`; this is what the other choice costs.
      slotEntries.current = 1;
      slotDraws.current = "whitespace";
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(rule()!.childElementCount).toBe(0);
      expect(rule()!.matches(":empty")).toBe(false);
    });

    it("keeps the rule out of the menu's role tree", () => {
      // The rows inside must read as direct children of `role="menu"`, and
      // a bare <div> between them breaks that relationship.
      slotEntries.current = 1;
      render(<AddButton addonProps={{ drive: "d" }} />);
      open();
      expect(rule()).toHaveAttribute("role", "none");
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
