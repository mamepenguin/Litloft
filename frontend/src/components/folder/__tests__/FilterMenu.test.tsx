import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FilterMenu } from "../FilterMenu";

const base = {
  typeFilter: null,
  onTypeFilterChange: vi.fn(),
};

const trigger = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "menu")!;

const rows = () => screen.getAllByRole("menuitemradio").map((r) => r.textContent?.trim());

describe("FilterMenu", () => {
  afterEach(cleanup);

  it("carries a word before anything is filtered", () => {
    // The two chips it replaces were bare icons until something was
    // selected, so nothing on the bar said what either one did. 案 2's
    // target for this toolbar is one unlabelled icon, the overflow.
    render(<FilterMenu {...base} />);
    expect(trigger()).toHaveAccessibleName("Filter");
    // The face's own recipe, at rest. It is not classless any more, but it
    // carries no cap either: one axis reaches 95px, and capping that at 96
    // would put a single-axis face one label-length away from eliding for
    // no reason. The cap arrives with the second axis — asserted below.
    expect([...trigger().querySelector("span")!.classList]).toEqual(["truncate"]);
  });

  it("offers both axes in one press, under their own headings", () => {
    render(<FilterMenu {...base} trustFilter={null} onTrustFilterChange={vi.fn()} />);
    fireEvent.click(trigger());
    const menu = screen.getByRole("menu");
    expect(
      [...menu.querySelectorAll("p")].map((p) => p.textContent),
    ).toEqual(["File type", "Verification"]);
    expect(rows()).toEqual([
      "All", "Video", "Image", "Audio", "Document", "Markdown", "PDF",
      "Archive", "Other",
      "All", "Verified only",
      "Unjudged onlyNobody has ruled on these, migrated files included",
    ]);
  });

  it("leaves the trust axis out where no handler is wired", () => {
    // Search, and only search: a semantic result set is ranked and
    // truncated server-side, so filtering it afterwards under-reports.
    // Absent, not present and dead.
    render(<FilterMenu {...base} />);
    fireEvent.click(trigger());
    expect(
      [...screen.getByRole("menu").querySelectorAll("p")].map((p) => p.textContent),
    ).toEqual(["File type"]);
    expect(rows()).toHaveLength(9);
  });

  it("says nothing about a filter it offers no way to clear", () => {
    // A trust value with no handler: the section is gone, so naming the
    // button after it would leave a control describing a filter it cannot
    // undo. The gate is on the handler, not on the value.
    render(<FilterMenu {...base} trustFilter="verified" />);
    expect(trigger()).toHaveAccessibleName("Filter");
    fireEvent.click(trigger());
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(9);
  });

  it("publishes each axis as a labelled group, and its rows as radios", () => {
    // `role="menu"` publishes only menuitem / group / separator children, so
    // a bare <p> heading reaches assistive technology as nothing — and this
    // menu has two rows both named "All".
    render(<FilterMenu {...base} trustFilter={null} onTrustFilterChange={vi.fn()} />);
    fireEvent.click(trigger());
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "File type" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Verification" })).toHaveLength(1);
  });

  it("says which row is on without relying on a tick nobody can read", () => {
    render(
      <FilterMenu
        {...base}
        typeFilter="image"
        trustFilter="unreviewed"
        onTrustFilterChange={vi.fn()}
      />,
    );
    fireEvent.click(trigger());
    expect(
      screen
        .getAllByRole("menuitemradio", { checked: true })
        .map((r) => r.textContent?.trim()),
    ).toEqual([
      "Image",
      "Unjudged onlyNobody has ruled on these, migrated files included",
    ]);
  });

  it("ticks All on an axis nothing is set on, even unset", () => {
    // `trustFilter` is optional, so it arrives as `undefined` from a caller
    // that only tracks the kind. `?? null` is what makes All the checked row
    // there rather than nothing being checked at all.
    render(<FilterMenu {...base} onTrustFilterChange={vi.fn()} />);
    fireEvent.click(trigger());
    expect(
      screen
        .getAllByRole("menuitemradio", { checked: true })
        .map((r) => r.textContent?.trim()),
    ).toEqual(["All", "All"]);
  });

  it("reports whether it is open", () => {
    render(<FilterMenu {...base} />);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on a click outside it", () => {
    // With two chips there were two ways out. There is one now.
    //
    // The scrim is found as a *sibling* of the menu, not by asking the
    // document for the first `[aria-hidden]`: lucide marks its icons that
    // way, so the loose query returned the icon inside the trigger, and
    // clicking it toggled the menu shut through the button. Deleting the
    // scrim entirely left that version green.
    render(<FilterMenu {...base} />);
    fireEvent.click(trigger());
    const menu = screen.getByRole("menu");
    const scrim = [...menu.parentElement!.children].find(
      (el) => el !== menu && el.getAttribute("aria-hidden") === "true",
    );
    expect(scrim).toBeTruthy();
    expect(scrim!.getAttribute("class")?.split(/\s+/)).toContain("fixed");
    fireEvent.click(scrim!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("names what is on, and keeps the word in front of it", () => {
    const { rerender } = render(<FilterMenu {...base} typeFilter="audio" />);
    // The tree pane's own kind filter is named "Filter by type" and narrows
    // the *tree*. Without the prefix this one answers to "Audio" while the
    // narrower control holds the broader word — and a test would have to
    // know the state to find it.
    expect(trigger()).toHaveAccessibleName("Filter: Audio");

    rerender(
      <FilterMenu
        {...base}
        typeFilter="audio"
        trustFilter="verified"
        onTrustFilterChange={vi.fn()}
      />,
    );
    // A button naming only the first would be lying about why the listing
    // is short.
    expect(trigger()).toHaveAccessibleName("Filter: Audio · Verified only");

    rerender(
      <FilterMenu {...base} trustFilter="verified" onTrustFilterChange={vi.fn()} />,
    );
    expect(trigger()).toHaveAccessibleName("Filter: Verified only");
    expect(trigger()).toHaveAccessibleName(/^Filter/);
  });

  it("reports a choice on each axis and closes", () => {
    const onTypeFilterChange = vi.fn();
    const onTrustFilterChange = vi.fn();
    render(
      <FilterMenu
        {...base}
        onTypeFilterChange={onTypeFilterChange}
        trustFilter={null}
        onTrustFilterChange={onTrustFilterChange}
      />,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Video" }));
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Verified only" }));
    expect(onTrustFilterChange).toHaveBeenCalledWith("verified");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the selected row on each axis", () => {
    render(
      <FilterMenu
        {...base}
        typeFilter="image"
        trustFilter="unreviewed"
        onTrustFilterChange={vi.fn()}
      />,
    );
    fireEvent.click(trigger());
    const marked = screen
      .getAllByRole("menuitemradio")
      .filter((r) => r.querySelector("svg"))
      .map((r) => r.textContent?.trim());
    expect(marked).toEqual([
      "Image",
      "Unjudged onlyNobody has ruled on these, migrated files included",
    ]);
  });
  it("keeps its visible words inside its accessible name", () => {
    // WCAG 2.5.3. A voice user says what the button reads; if the name does
    // not contain that string, the control cannot be reached by saying it.
    for (const props of [
      base,
      { ...base, typeFilter: "audio" as const },
      {
        ...base,
        typeFilter: "audio" as const,
        trustFilter: "verified" as const,
        onTrustFilterChange: vi.fn(),
      },
    ]) {
      cleanup();
      render(<FilterMenu {...props} />);
      const el = trigger();
      const visible = el.textContent?.trim() ?? "";
      const name = el.getAttribute("aria-label") ?? visible;
      expect(name).toContain(visible);
    }
  });

  it("keeps the popover's recipe, which is what keeps it on screen", () => {
    // `sm:max-h-[70vh]` and dropping `sm:overflow-visible` are what make a
    // twelve-row menu fit: measured in Chromium, reverting to
    // `sm:max-h-none` leaves 74% of it visible at 1280x480 and 79% at
    // 768x520. jsdom cannot see that, so the recipe is pinned whole —
    // any edit to it comes here and has to be re-measured.
    render(<FilterMenu {...base} />);
    fireEvent.click(trigger());
    expect(
      (screen.getByRole("menu").getAttribute("class") ?? "").split(/\s+/),
    ).toEqual([
      "fixed", "inset-x-2", "bottom-4", "z-40", "max-h-[60vh]",
      "overflow-y-auto", "rounded-2xl", "border", "border-bg-border",
      "bg-bg-primary", "py-1", "shadow-lg", "animate-fade-in-scale",
      "sm:absolute", "sm:inset-x-auto", "sm:bottom-auto",
      "sm:top-full", "sm:mt-1", "sm:max-h-[70vh]", "sm:min-w-[200px]",
      "sm:right-0", "sm:origin-top-right",
    ]);
  });

  it("keeps both of the trigger's recipes, resting and filtering", () => {
    // The menu's class list is a constant, so pinning it guards nothing that
    // can vary. The *trigger* is where the branch is, and swapping its two
    // arms — filtering looking idle, idle looking filtered — passed every
    // test in this file.
    const RESTING = [
      "flex", "items-center", "gap-1.5", "rounded-2xl", "border", "px-3",
      "py-2", "text-sm", "transition-colors", "pointer-coarse:min-h-11",
      "border-bg-border", "bg-bg-card", "text-text-muted",
      "hover:text-text-primary",
    ];
    const FILTERING = [
      "flex", "items-center", "gap-1.5", "rounded-2xl", "border", "px-3",
      "py-2", "text-sm", "transition-colors", "pointer-coarse:min-h-11",
      "border-bg-border", "bg-bg-elevated", "text-text-primary", "font-medium",
    ];
    const classes = () =>
      (trigger().getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

    const { rerender } = render(<FilterMenu {...base} />);
    expect(classes()).toEqual(RESTING);
    rerender(<FilterMenu {...base} typeFilter="audio" />);
    expect(classes()).toEqual(FILTERING);
  });

  it("marks every row as a radio, not only the one that is on", () => {
    // `aria-checked` is required on every `menuitemradio`; a row missing it
    // stops being a radio to assistive technology. Asserting only the
    // checked ones cannot see that.
    render(
      <FilterMenu
        {...base}
        typeFilter="image"
        trustFilter="verified"
        onTrustFilterChange={vi.fn()}
      />,
    );
    fireEvent.click(trigger());
    expect(screen.getAllByRole("menuitemradio", { checked: true })).toHaveLength(2);
    expect(screen.getAllByRole("menuitemradio", { checked: false })).toHaveLength(10);
  });

  it("puts the rule between the two groups, not inside one", () => {
    // Inside, a reader hears "verification group, separator" as though the
    // group were being divided rather than separated from what precedes it.
    render(<FilterMenu {...base} trustFilter={null} onTrustFilterChange={vi.fn()} />);
    fireEvent.click(trigger());
    const menu = screen.getByRole("menu");
    const rule = menu.querySelector('[role="separator"]')!;
    expect(rule.parentElement).toBe(menu);
    expect(rule.closest('[role="group"]')).toBeNull();
  });

  it("does not read a group's own heading back as its content", () => {
    render(<FilterMenu {...base} trustFilter={null} onTrustFilterChange={vi.fn()} />);
    fireEvent.click(trigger());
    for (const g of screen.getAllByRole("group")) {
      const heading = document.getElementById(g.getAttribute("aria-labelledby")!)!;
      expect(heading).toHaveAttribute("aria-hidden", "true");
    }
    // The name survives being hidden: `aria-labelledby` resolves it anyway.
    expect(screen.getAllByRole("group", { name: "File type" })).toHaveLength(1);
  });

  it.each([
    ["the trigger, where focus is when it opens", () => trigger()],
    ["a row, once the reader has tabbed in", () => screen.getAllByRole("menuitemradio")[0]],
    ["the menu itself", () => screen.getByRole("menu")],
  ])("lets a keyboard out from %s", (_label, target) => {
    // Every path, because the first version only worked from one. Focus
    // stays on the trigger when the menu opens, and the handler was on the
    // menu — so Escape after a click, after Enter and after Space all left
    // it open, while the test dispatched on the menu element and passed.
    render(<FilterMenu {...base} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(target(), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("leaves other keys to whatever is above it", () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <FilterMenu {...base} />
      </div>,
    );
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    // Escape is answered here and stopped: `escape-listeners.test.ts`
    // records that a React handler is invisible to the shortcut registry,
    // so one that also reached the document would be answered twice.
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when it is already closed", () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <FilterMenu {...base} />
      </div>,
    );
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("names an unknown kind after itself, never after All", () => {
    // Naming the neutral option while the listing is narrowed is the one
    // way this button can state the opposite of what is happening.
    // @ts-expect-error a kind outside the table, as an old snapshot holds
    render(<FilterMenu {...base} typeFilter="bogus" />);
    expect(trigger()).toHaveAccessibleName("Filter: bogus");
    fireEvent.click(trigger());
    expect(screen.queryAllByRole("menuitemradio", { checked: true })).toHaveLength(0);
  });
});
