import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Filter } from "lucide-react";

import { MenuRadioGroup, MenuSeparator, ToolbarMenu } from "../ToolbarMenu";

const rows = (close: () => void) => (
  <button role="menuitem" onClick={close}>
    A row
  </button>
);

describe("ToolbarMenu", () => {
  afterEach(cleanup);

  it("names itself for the control and for the state", () => {
    // WCAG 2.5.3: the accessible name has to contain the visible label, so
    // a voice user saying what they read reaches the control. The face reads
    // the state, so the name is `control: state` and containment holds in
    // both directions — the word for what it does is findable without
    // knowing the state.
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
    // Reachable: an order the screen does not offer — `relevance` outside a
    // search — falls back to naming the control, and "Sort: Sort" is a name
    // that repeats itself.
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
    // which is outside the menu. `FilterMenu` records the measurement that
    // a handler on the menu only fires for someone already tabbed into it.
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // The row that was focused unmounts with the menu; without the return,
    // focus lands on <body>.
    expect(document.activeElement).toBe(trigger);
  });

  it("stops Escape rather than letting the shortcut stack answer it twice", () => {
    // `escape-listeners.test.ts` records the mechanism: a React `onKeyDown`
    // is invisible to the shortcut registry, so an Escape that also reaches
    // the document gets answered by both.
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
    // A literal, not the imported `MENU_SURFACE`. Comparing the element's
    // class to the constant it is set from compares the constant to itself:
    // an independent review deleted `sm:absolute` — the token that decides
    // between a bottom sheet and a menu anchored to its trigger, the most
    // consequential one in the string — and all 143 tests passed. The copy
    // is the assertion. `FilterMenu.test.tsx` writes its own recipe out for
    // the same reason.
    //
    // jsdom lays nothing out, so nothing here can see the shape; what it can
    // see is that the recipe has not been edited without being re-measured.
    // `sm:max-h-[70vh]` with the scroll kept is load-bearing above 640: the
    // menu holds ten rows below 768 — `View` and `Sort` are sections of it
    // there — and is anchored inside a sticky bar, so an uncapped one puts
    // six of them past the bottom of a landscape phone with no way to
    // scroll to them. Below 640 the sheet form is already capped at 60vh.
    //
    // Measured in Chromium on the folder toolbar, after the open animation
    // settles (`animate-fade-in-scale` starts at `scale(.95)`, and reading
    // the box during it reports 95% of every number). At 375px, through the
    // overflow — which is the only trigger on the bar at that width — it is
    // the bottom sheet: left 8, 359x480, the width the viewport leaves
    // between `inset-x-2` and the height `max-h-[60vh]` caps. At 1512px the
    // sort menu is 200x290 hanging under its own trigger, right edges
    // aligned at 1366.
    render(
      <ToolbarMenu label="Sort" value="Newest first" icon={Filter}>
        {rows}
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      (screen.getByRole("menu").getAttribute("class") ?? "").split(/\s+/),
    ).toEqual([
      "fixed", "inset-x-2", "bottom-4", "z-40", "max-h-[60vh]",
      "overflow-y-auto", "rounded-2xl", "border", "border-bg-border",
      "bg-bg-primary", "py-1", "shadow-lg", "animate-fade-in-scale",
      "sm:absolute", "sm:inset-x-auto", "sm:bottom-auto", "sm:right-0",
      "sm:top-full", "sm:mt-1", "sm:max-h-[70vh]", "sm:min-w-[200px]",
      "sm:origin-top-right",
    ]);
  });
});

describe("MenuSeparator", () => {
  afterEach(cleanup);

  it("is a separator to something that cannot see the line", () => {
    // A `role="menu"` publishes only menuitem / group / separator children —
    // the same rule this file's group test cites. A rule dropped to a bare
    // <div> divides nothing for anyone not looking at it.
    render(<MenuSeparator />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});

describe("MenuRadioGroup", () => {
  afterEach(cleanup);

  it("marks every row as a radio, not only the one that is on", () => {
    // `aria-checked` is required on every `menuitemradio`; a row missing it
    // stops being a radio to assistive technology, and asserting only the
    // checked one cannot see that.
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
    // A `role="menu"` publishes only menuitem / group / separator children,
    // so a bare <p> heading reaches assistive technology as nothing at all —
    // and these menus hold rows whose words repeat across sections.
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
    // full-width row is clipped at the padding edges. A negative offset
    // puts it inside. Dropping the cap that causes this is not the
    // alternative: it is what makes a ten-row menu reachable at 640-767.
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
