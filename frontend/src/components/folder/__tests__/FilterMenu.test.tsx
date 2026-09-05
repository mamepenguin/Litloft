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
    expect(trigger().querySelector("span")?.getAttribute("class")).toBeNull();
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
      "sm:absolute", "sm:inset-x-auto", "sm:bottom-auto", "sm:right-0",
      "sm:top-full", "sm:mt-1", "sm:max-h-[70vh]", "sm:min-w-[200px]",
      "sm:origin-top-right",
    ]);
  });
});
