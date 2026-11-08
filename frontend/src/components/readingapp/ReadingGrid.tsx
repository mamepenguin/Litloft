"use client";

import type { ReactNode } from "react";

import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";

export function ReadingGrid<T extends { id: string }>({
  items,
  renderItem,
}: {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
}) {
  const { ref, columns } = useCardColumns();
  return (
    <ul ref={ref} className="grid gap-3" style={{ gridTemplateColumns: cardGridTemplate(columns) }}>
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
