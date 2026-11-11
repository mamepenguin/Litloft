"use client";

import type { ReactNode } from "react";

import { VIDEO_GRID, cardGridTemplate, useCardColumns } from "@/lib/cardGrid";

export function VideoGrid({ children }: { children: (columns: number) => ReactNode }) {
  const { ref, columns } = useCardColumns(VIDEO_GRID);

  return (
    <ul
      ref={ref}
      className="grid gap-x-4 gap-y-8"
      style={{ gridTemplateColumns: cardGridTemplate(columns, VIDEO_GRID) }}
    >
      {children(columns)}
    </ul>
  );
}
