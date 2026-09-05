import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { SortButton } from "@/components/SortButton";
import { SortMenu } from "@/components/folder/SortMenu";

/**
 * Trash and the drive root sort a listing through `SortButton`; the folder
 * toolbar sorts one through `SortMenu`. Two components, two renderers, one
 * table — `components/sortOptions.ts`.
 *
 * The table was inside `SortButton` until B2b-2b needed the same orders in a
 * labelled control, and copying it is what this guards. A copy fails nothing
 * on the day it is made: both menus go on working, offering different orders
 * on different screens, and the only symptom is a folder that can be sorted
 * by something Trash cannot.
 *
 * Both sides are rendered rather than compared as data, so a renderer that
 * drops a row — or prints the key instead of the word — is caught with the
 * same assertion.
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
  // Its rows are plain buttons, not `menuitemradio` — a difference this
  // test deliberately does not smooth over, because it is what makes the
  // two sides separate implementations rather than one read twice.
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
    // A literal, because the comparison above cannot see the shared table
    // move. Both sides derive from `sortOptions.ts`, so swapping two rows
    // there swaps them identically on both and the equality still holds —
    // demonstrated by mutation. The sequence is a real decision: newest
    // first is the default and leads, the two title orders sit together,
    // and `docs/user-guide/file-browsing.md` enumerates them in this order.
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
    // At the top, not merely present: it is the search default, so the row
    // a reader reaches for first is the one they are already in.
    expect(viaMenu[0]).toBe("Relevance");
    expect(viaMenu.length).toBe(8);
  });
});

describe("an order the screen does not offer", () => {
  afterEach(cleanup);

  it("makes the face name the control rather than an order it is not in", () => {
    // `relevance` stored against a folder: `isSortField` admits it, and a
    // folder listing passes `allowRelevance` false, so no row matches. The
    // face falls back to the word for what the control does.
    render(
      <SortMenu sort="relevance" order="desc" onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("Sort");
    // One word, not "Sort: Sort" — and not an empty face with an accessible
    // name of "Sort: ", which `/^Sort/` would still have matched.
    expect(trigger).toHaveAccessibleName("Sort");
  });
});
