import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { MIN_CARD_COLUMNS, rowsFor } from "@/lib/cardGrid";
import { ShelfBlock } from "../ShelfBlock";

const measured = vi.hoisted(() => ({ columns: 4 }));

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: measured.columns }),
}));

type Card = { id: string; title: string };

const ITEMS: Card[] = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  title: `Card ${i}`,
}));

function renderShelf(columns: number) {
  measured.columns = columns;
  return render(
    <ShelfBlock
      title="Shelf"
      count="12"
      seeAllHref="/drive/main/apps/video/shelf?by=all&key=all"
      view={{ status: "loaded", items: ITEMS }}
      onRetry={() => {}}
      renderItem={(item) => <span>{item.title}</span>}
    />,
  );
}

beforeEach(() => {
  measured.columns = 4;
});

describe("a shelf draws only the cards its columns and rows hold", () => {
  it.each([
    [2, 2 * rowsFor(2)],
    [3, 3 * rowsFor(3)],
    [4, 4 * rowsFor(4)],
    [5, 5 * rowsFor(5)],
  ])("draws %i columns' worth of cards", (columns, expected) => {
    renderShelf(columns);

    expect(screen.getByText("Card 0")).toBeInTheDocument();
    expect(screen.getByText(`Card ${expected - 1}`)).toBeInTheDocument();
    expect(screen.queryByText(`Card ${expected}`)).not.toBeInTheDocument();
  });

  it("uses the two-column floor before the container is measured", () => {
    renderShelf(0);

    expect(screen.getByText(`Card ${MIN_CARD_COLUMNS * rowsFor(MIN_CARD_COLUMNS) - 1}`)).toBeInTheDocument();
    expect(
      screen.queryByText(`Card ${MIN_CARD_COLUMNS * rowsFor(MIN_CARD_COLUMNS)}`),
    ).not.toBeInTheDocument();
  });

  it("is a grid, never a sideways scroller", () => {
    const { container } = renderShelf(4);
    const grid = container.querySelector("ul");

    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("grid");
    expect(grid!.className).not.toContain("overflow-x-auto");
    expect(grid!.className).not.toContain("snap-x");
  });

  it("keeps the title row and See all in the section", () => {
    renderShelf(4);

    expect(screen.getByRole("heading", { name: "Shelf" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute(
      "href",
      "/drive/main/apps/video/shelf?by=all&key=all",
    );
  });
});
