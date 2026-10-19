import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Filter } from "lucide-react";

import {
  MENU_SURFACE_GAP_PX,
  MenuRadioGroup,
  MenuSeparator,
  ToolbarMenu,
} from "../ToolbarMenu";

const rows = (close: () => void) => (
  <button role="menuitem" onClick={close}>
    A row
  </button>
);

describe("ToolbarMenu", () => {
  afterEach(cleanup);
  afterEach(() => vi.restoreAllMocks());

  function stubMenuBoxes(
    wrapper: { top: number; bottom: number },
    menu: { height: number; width: number },
  ) {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if ((this as HTMLElement).classList.contains("relative")) {
          return { ...wrapper, left: 300, right: 460 } as DOMRect;
        }
        if (this.getAttribute("role") === "menu") return { ...menu } as DOMRect;
        return original.call(this);
      },
    );
  }

  it("names itself for the control and for the state", () => {
    // WCAG 2.5.3: the accessible name has to contain the visible label.
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAccessibleName("Sort: Newest first");
    expect(trigger).toHaveTextContent("Newest first");
  });

  it("says one thing once when the state is the control's own word", () => {
    render(
      <ToolbarMenu label="Sort" value="Sort" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName("Sort");
  });

  it("reports whether it is open, and closes on Escape with focus back on it", () => {
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Sort: Newest first" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // On the box, not on the menu: opening leaves focus on the trigger,
    // which is outside the menu.
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("stops Escape rather than letting the shortcut stack answer it twice", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
          {rows}
        </ToolbarMenu>
      </div>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(outer).not.toHaveBeenCalled();
  });

  it("leaves other keys, and a closed menu's Escape, to whatever is above it", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
          {rows}
        </ToolbarMenu>
      </div>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "Escape" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(outer).toHaveBeenCalledTimes(2);
  });

  it("closes when the scrim is pressed", () => {
    const { container } = render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(container.querySelector('[aria-hidden="true"]')!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the popover's recipe, which is what keeps it on screen", () => {
    // A literal, not the string `useMenuSurface` builds. Comparing the
    // element's class to the recipe it is set from compares the recipe to
    // itself.
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      (screen.getByRole("menu").getAttribute("class") ?? "").split(/\s+/),
    ).toEqual([
      "fixed", "inset-x-2", "bottom-[calc(1rem+var(--resting-strip,0px))]", "z-40", "max-h-[60vh]",
      "overflow-y-auto", "rounded-2xl", "border", "border-bg-border",
      "bg-bg-primary", "py-1", "shadow-lg", "animate-fade-in-scale",
      "sm:absolute", "sm:inset-x-auto", "sm:max-h-[70vh]",
      "sm:min-w-[200px]",
      "sm:bottom-auto", "sm:top-full", "sm:mt-1",
      "sm:right-0", "sm:origin-top-right",
    ]);
  });

  it("spells the upward form as the mirror of the downward one", () => {
    // The sheet form below 640 sets `bottom`, and above it exactly one of
    // `sm:bottom-auto` (down) and `sm:bottom-full` (up) has to override it.
    stubMenuBoxes({ top: 700, bottom: 740 }, { height: 300, width: 200 });
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    const classes = (screen.getByRole("menu").getAttribute("class") ?? "").split(
      /\s+/,
    );

    expect(
      classes.filter((c) => /^sm:(top|bottom|mt|mb|origin)/.test(c)),
    ).toEqual([
      "sm:top-auto",
      "sm:bottom-full",
      "sm:mb-1",
      "sm:origin-bottom-right",
    ]);
  });

  it("ties the gap it measures with to the gap it draws", () => {
    // Tailwind's spacing unit is 4px.
    const spacing = (cls: string) => {
      const n = /^sm:m[tb]-(\d+)$/.exec(cls);
      return n ? Number(n[1]) * 4 : null;
    };

    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    const drawn = (screen.getByRole("menu").getAttribute("class") ?? "")
      .split(/\s+/)
      .map(spacing)
      .filter((px): px is number => px !== null);

    expect(drawn).toEqual([MENU_SURFACE_GAP_PX]);
  });

  it("hangs the anchored form from the edge the caller names", () => {
    // Only the anchored form has a side. The sheet below 640 spans the
    // viewport, so `inset-x-2` is asserted to be the same in both.
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter} align="start">
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    const classes = (screen.getByRole("menu").getAttribute("class") ?? "").split(
      /\s+/,
    );
    expect(classes.filter((c) => /^sm:(left|right|origin)/.test(c))).toEqual([
      "sm:left-0",
      "sm:origin-top-left",
    ]);
    expect(classes).toContain("inset-x-2");
  });
});

describe("MenuSeparator", () => {
  afterEach(cleanup);

  it("is a separator to something that cannot see the line", () => {
    render(<MenuSeparator />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});

describe("MenuRadioGroup", () => {
  afterEach(cleanup);

  it("marks every row as a radio, not only the one that is on", () => {
    render(
      <MenuRadioGroup
        heading="View"
        options={[
          { value: "grid", label: "Grid view" },
          { value: "list", label: "List view" },
        ]}
        isSelected={(v) => v === "grid"}
        onSelect={vi.fn()}
      />,
    );
    const radios = screen.getAllByRole("menuitemradio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
  });

  it("gives the group a name without reading the heading back as a row", () => {
    render(
      <MenuRadioGroup
        heading="View"
        options={[{ value: "grid", label: "Grid view" }]}
        isSelected={() => false}
        onSelect={vi.fn()}
      />,
    );
    const group = screen.getByRole("group");
    expect(group).toHaveAccessibleName("View");
    expect(document.getElementById(group.getAttribute("aria-labelledby")!))
      .toHaveAttribute("aria-hidden", "true");
  });

  it("draws a focused row's ring inside the row", () => {
    // The menu scrolls on both axes — CSS resolves `overflow-x` to `auto`
    // once the other axis is not `visible` — so an outline drawn around a
    // full-width row is clipped at the padding edges.
    render(
      <MenuRadioGroup
        heading="View"
        options={[{ value: "grid", label: "Grid view" }]}
        isSelected={() => false}
        onSelect={vi.fn()}
      />,
    );
    expect([...screen.getByRole("menuitemradio").classList]).toContain(
      "focus-visible:-outline-offset-2",
    );
  });

  it("hands the pressed row's own value back", () => {
    const onSelect = vi.fn();
    render(
      <MenuRadioGroup
        heading="View"
        options={[
          { value: "grid", label: "Grid view" },
          { value: "list", label: "List view" },
        ]}
        isSelected={() => false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "List view" }));
    expect(onSelect).toHaveBeenCalledWith("list");
  });
});
