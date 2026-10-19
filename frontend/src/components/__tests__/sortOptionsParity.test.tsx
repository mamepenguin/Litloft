import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { SortButton } from "@/components/SortButton";
import { SortMenu } from "@/components/folder/SortMenu";

/**
 * Both sides are rendered rather than compared as data, so a renderer that
 * drops a row or prints the key instead of the word is caught too.
 */
const rowText = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((r) => (r.textContent ?? "").trim());

function fromSortButton(allowRelevance?: boolean): string[] {
  const { container } = render(
    <SortButton
      sort="created_at"
      order="desc"
      onChange={vi.fn()}
      allowRelevance={allowRelevance}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sort" }));
  // Its rows are plain buttons, not `menuitemradio`.
  return [...container.querySelectorAll("button")]
    .slice(1)
    .map((b) => (b.textContent ?? "").trim());
}

function fromSortMenu(allowRelevance?: boolean): string[] {
  render(
    <SortMenu
      sort="created_at"
      order="desc"
      onChange={vi.fn()}
      allowRelevance={allowRelevance}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Sort/ }));
  return rowText(screen.getByRole("menu"), '[role="menuitemradio"]');
}

describe("the orders a listing can be put in", () => {
  afterEach(cleanup);

  it("are the same seven in Trash's control and the folder toolbar's", () => {
    const viaButton = fromSortButton();
    cleanup();
    const viaMenu = fromSortMenu();
    expect(viaMenu).toEqual(viaButton);
    // A literal, because both sides derive from `sortOptions.ts` and the
    // comparison above cannot see a change to the shared table.
    expect(viaMenu).toEqual([
      "Newest first",
      "Oldest first",
      "Title A→Z",
      "Title Z→A",
      "Size largest",
      "Size smallest",
      "Random",
    ]);
  });

  it("gain relevance on both, and only where a query asked for it", () => {
    const viaButton = fromSortButton(true);
    cleanup();
    const viaMenu = fromSortMenu(true);
    expect(viaMenu).toEqual(viaButton);
    expect(viaMenu[0]).toBe("Relevance");
    expect(viaMenu.length).toBe(8);
  });
});

describe("an order the screen does not offer", () => {
  afterEach(cleanup);

  it("makes the face name the control rather than an order it is not in", () => {
    // `relevance` stored against a folder: `isSortField` admits it, but a
    // folder listing offers no relevance row.
    render(
      <SortMenu sort="relevance" order="desc" onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("Sort");
    expect(trigger).toHaveAccessibleName("Sort");
  });
});
