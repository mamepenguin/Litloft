"use client";

import type { ReactNode } from "react";

import { BOOK_GRID, cardGridTemplate, useCardColumns } from "@/lib/cardGrid";

export function ReadingGrid<T extends { id: string }>({
  items,
  renderItem,
}: {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
}) {
  const { ref, columns } = useCardColumns(BOOK_GRID);
  return (
    <ul
      ref={ref}
      className="grid gap-5"
      style={{ gridTemplateColumns: cardGridTemplate(columns, BOOK_GRID) }}
    >
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
