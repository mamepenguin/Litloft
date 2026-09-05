import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FilterMenu } from "../FilterMenu";

const base = {
  typeFilter: null,
  onTypeFilterChange: vi.fn(),
};

const trigger = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "menu")!;

const rows = () => screen.getAllByRole("menuitem").map((r) => r.textContent?.trim());

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
    // Archive listings and other non-drive surfaces. Absent, not present
    // and dead.
    render(<FilterMenu {...base} />);
    fireEvent.click(trigger());
    expect(
      [...screen.getByRole("menu").querySelectorAll("p")].map((p) => p.textContent),
    ).toEqual(["File type"]);
    expect(rows()).toHaveLength(9);
  });

  it("names what is on, and both when both are", () => {
    const { rerender } = render(<FilterMenu {...base} typeFilter="audio" />);
    expect(trigger()).toHaveAccessibleName("Audio");

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
    expect(trigger()).toHaveAccessibleName("Audio · Verified only");

    rerender(
      <FilterMenu {...base} trustFilter="verified" onTrustFilterChange={vi.fn()} />,
    );
    expect(trigger()).toHaveAccessibleName("Verified only");
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Video" }));
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Verified only" }));
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
      .getAllByRole("menuitem")
      .filter((r) => r.querySelector("svg"))
      .map((r) => r.textContent?.trim());
    expect(marked).toEqual([
      "Image",
      "Unjudged onlyNobody has ruled on these, migrated files included",
    ]);
  });
});
