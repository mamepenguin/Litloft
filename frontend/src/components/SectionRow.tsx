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
 * The card row on the drive home: as many cards as fit, and no more.
 *
 * The shelves used to be a `flex` strip that scrolled sideways, which
 * said nothing about how much was off the edge — 00-basis 原則 5, "what
 * is cut off should look cut off". They are a grid now, and the count
 * that would have overflowed is simply not rendered.
 *
 * **Not rendered, not hidden.** Clipping the overflowing rows with
 * `overflow: hidden` would leave focusable cards behind the edge, which
 * is the same defect GAL-2 reported against the gallery's missing
 * `inert`. So the children are sliced.
 *
 * Two hosts render this shape (`CarouselSection` and
 * `ContinueWatchingSection`) and their heads genuinely differ — one has a
 * refresh control, the other a history-removal menu. Only the row is
 * shared, which is the part that would otherwise drift.
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
