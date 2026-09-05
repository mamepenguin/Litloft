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
    // `toBe`, not a floor: an order dropped from the shared table
    // disappears from both sides at once and the comparison above stays
    // true.
    expect(viaMenu.length).toBe(7);
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
