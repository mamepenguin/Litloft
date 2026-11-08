"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { ShelfItem } from "@/lib/api";
import { VideoCard } from "./VideoCard";

export type ShelfView =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; items: readonly ShelfItem[] };

const CARD_SLOT = "w-44 flex-shrink-0 snap-start sm:w-56 xl:w-[calc((100%-3rem)/5)]";

function SkeletonCard() {
  return (
    <li className={`${CARD_SLOT} animate-pulse`} aria-hidden="true">
      <div className="aspect-video rounded-2xl bg-bg-elevated" />
      <div className="mt-2 h-4 w-3/4 rounded-lg bg-bg-elevated" />
    </li>
  );
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("tree");
  return (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-2xl border border-bg-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11"
    >
      {t("errorRetry")}
    </button>
  );
}

export function ShelfBlock({
  title,
  count,
  seeAllHref,
  view,
  onRetry,
}: {
  title: string;
  /** Already in the viewer's number format. */
  count?: string;
  seeAllHref?: string;
  view: ShelfView;
  onRetry: () => void;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("videoApp");

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline gap-2">
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
            className="ml-auto flex-shrink-0 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {tc("seeAll")}
          </Link>
        )}
      </div>

      {view.status === "failed" ? (
        <RetryButton onRetry={onRetry} />
      ) : (
        <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
          {view.status === "loading"
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            : view.items.map((item) => (
                <li key={item.id} className={CARD_SLOT}>
                  <VideoCard item={item} />
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}
