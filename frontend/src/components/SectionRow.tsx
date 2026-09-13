"use client";

import { Children } from "react";
import {
  MIN_CARD_COLUMNS,
  cardGridTemplate,
  rowsFor,
  useCardColumns,
} from "@/lib/cardGrid";

interface SectionRowProps {
  children: React.ReactNode;
}

/**
 * **Not rendered, not hidden.** Clipping the overflowing rows with
 * `overflow: hidden` would leave focusable cards behind the edge, so the
 * children are sliced.
 */
export function SectionRow({ children }: SectionRowProps) {
  const { ref, columns } = useCardColumns();
  // Until the element has been measured `columns` is 0. The floor is the
  // count that is right for the narrowest container, so an unmeasured
  // first frame under-fills a wide screen rather than overflowing a
  // phone.
  const effective = columns > 0 ? columns : MIN_CARD_COLUMNS;
  const capacity = effective * rowsFor(effective);

  return (
    <div
      ref={ref}
      className="grid gap-x-3 gap-y-6"
      style={{ gridTemplateColumns: cardGridTemplate(columns) }}
    >
      {Children.toArray(children).slice(0, capacity)}
    </div>
  );
}
