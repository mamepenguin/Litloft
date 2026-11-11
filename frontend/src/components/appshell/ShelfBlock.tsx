"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  BOOK_GRID,
  MIN_CARD_COLUMNS,
  cardGridTemplate,
  rowsFor,
  useCardColumns,
} from "@/lib/cardGrid";
import { RetryButton } from "./RetryButton";
import { VideoGrid } from "./VideoGrid";

export type ShelfView<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; items: readonly T[] };

type GridView<T> = Exclude<ShelfView<T>, { status: "failed" }>;

function SkeletonCard({ book }: { book: boolean }) {
  return (
    <li className="animate-pulse" aria-hidden="true">
      <div
        className={
          book
            ? "aspect-[2/3] rounded-xl bg-bg-elevated"
            : "aspect-video rounded-2xl bg-bg-elevated"
        }
      />
      <div
        className={
          book
            ? "mt-2 h-4 w-3/4 rounded-lg bg-bg-elevated"
            : "mt-3 h-[1.375rem] w-3/4 rounded-lg bg-bg-elevated"
        }
      />
    </li>
  );
}

/** Clipped rather than hidden: the unmeasured first frame under-fills, never overflows. */
function capacityOf(columns: number): number {
  const effective = columns > 0 ? columns : MIN_CARD_COLUMNS;
  return effective * rowsFor(effective);
}

function cardsOf<T extends { id: string }>(
  view: GridView<T>,
  columns: number,
  renderItem: (item: T) => ReactNode,
  book: boolean,
): ReactNode {
  const capacity = capacityOf(columns);
  return view.status === "loading"
    ? Array.from({ length: capacity }).map((_, i) => <SkeletonCard key={i} book={book} />)
    : view.items.slice(0, capacity).map((item) => (
        <li key={item.id} className="min-w-0">
          {renderItem(item)}
        </li>
      ));
}

function BookGrid<T extends { id: string }>({
  view,
  renderItem,
}: {
  view: GridView<T>;
  renderItem: (item: T) => ReactNode;
}) {
  const { ref, columns } = useCardColumns(BOOK_GRID);

  return (
    <ul
      ref={ref}
      className="grid gap-5"
      style={{ gridTemplateColumns: cardGridTemplate(columns, BOOK_GRID) }}
    >
      {cardsOf(view, columns, renderItem, true)}
    </ul>
  );
}

export function ShelfBlock<T extends { id: string }>({
  title,
  count,
  seeAllHref,
  view,
  onRetry,
  renderItem,
  book = false,
}: {
  title: string;
  /** Already in the viewer's number format. */
  count?: string;
  seeAllHref?: string;
  view: ShelfView<T>;
  onRetry: () => void;
  renderItem: (item: T) => ReactNode;
  book?: boolean;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("appShell");

  return (
    <section className="min-w-0">
      <div className="mb-4 flex min-w-0 items-baseline gap-2">
        {title ? (
          <h2 className="min-w-0 truncate text-lg font-bold text-text-primary">{title}</h2>
        ) : (
          <div aria-hidden="true" className="h-6 w-32 animate-pulse rounded-lg bg-bg-elevated" />
        )}
        {count !== undefined && (
          <span className="flex-shrink-0 text-sm tabular-nums text-text-muted">{count}</span>
        )}
        {seeAllHref !== undefined && (
          <Link
            href={seeAllHref}
            aria-label={t("seeAllIn", { name: title })}
            className="ml-auto inline-flex flex-shrink-0 items-center gap-0.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {tc("seeAll")}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>

      {view.status === "failed" ? (
        <RetryButton onRetry={onRetry} />
      ) : book ? (
        <BookGrid view={view} renderItem={renderItem} />
      ) : (
        <VideoGrid>
          {(columns) => cardsOf(view, columns, renderItem, false)}
        </VideoGrid>
      )}
    </section>
  );
}
