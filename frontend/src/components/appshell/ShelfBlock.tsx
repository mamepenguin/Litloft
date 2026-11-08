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
      <div className="mt-2 h-4 w-3/4 rounded-lg bg-bg-elevated" />
    </li>
  );
}

/** Clipped rather than hidden: the unmeasured first frame under-fills, never overflows. */
function capacityOf(columns: number): number {
  const effective = columns > 0 ? columns : MIN_CARD_COLUMNS;
  return effective * rowsFor(effective);
}

export function ShelfGrid<T extends { id: string }>({
  view,
  renderItem,
  book = false,
}: {
  view: GridView<T>;
  renderItem: (item: T) => ReactNode;
  book?: boolean;
}) {
  const { ref, columns } = useCardColumns(book ? BOOK_GRID : undefined);
  const capacity = capacityOf(columns);

  return (
    <ul
      ref={ref}
      className={`grid ${book ? "gap-5" : "gap-3"}`}
      style={{
        gridTemplateColumns: cardGridTemplate(columns, book ? BOOK_GRID : undefined),
      }}
    >
      {view.status === "loading"
        ? Array.from({ length: capacity }).map((_, i) => (
            <SkeletonCard key={i} book={book} />
          ))
        : view.items.slice(0, capacity).map((item) => (
            <li key={item.id} className="min-w-0">
              {renderItem(item)}
            </li>
          ))}
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
      <div className="mb-3 flex min-w-0 items-baseline gap-2">
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
      ) : (
        <ShelfGrid view={view} renderItem={renderItem} book={book} />
      )}
    </section>
  );
}
