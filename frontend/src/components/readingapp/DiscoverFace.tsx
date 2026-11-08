"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { ShelfBlock, type ShelfView } from "@/components/appshell/ShelfBlock";
import type { LoadState } from "@/components/appshell/useLoad";
import type { ShelfItem } from "@/lib/api";
import { ReadingCard } from "./ReadingCard";
import { readingShelfHref } from "./shelfLinks";

interface ShelfSource {
  state: LoadState<ShelfItem[]>;
  retry: () => void;
}

function viewOf(state: LoadState<ShelfItem[]>): ShelfView<ShelfItem> {
  if (state.status === "loaded") return { status: "loaded", items: state.data };
  if (state.status === "failed") return { status: "failed" };
  return { status: "loading" };
}

/** A shelf with nothing to show is not drawn; one still loading or failed is. */
function drawn(state: LoadState<ShelfItem[]>): boolean {
  return state.status !== "idle" && !(state.status === "loaded" && state.data.length === 0);
}

export function DiscoverFace({
  drive,
  empty,
  hasProfile,
  continueShelf,
  notRead,
  fresh,
}: {
  drive: string;
  /** The target intersects no book kind. */
  empty: boolean;
  hasProfile: boolean;
  continueShelf: ShelfSource;
  notRead: ShelfSource;
  fresh: ShelfSource;
}) {
  const t = useTranslations("readingApp");
  const shelves = [
    ...(hasProfile
      ? [
          {
            id: "continue",
            title: t("shelves.continue"),
            source: continueShelf,
            href: readingShelfHref(drive, "watch", "in_progress"),
            progress: true,
          },
        ]
      : []),
    {
      id: "notRead",
      title: t("shelves.notReadYet"),
      source: notRead,
      href: hasProfile ? readingShelfHref(drive, "watch", "unwatched") : undefined,
      progress: false,
    },
    {
      id: "new",
      title: t("shelves.new"),
      source: fresh,
      href: readingShelfHref(drive, "all", "all"),
      progress: false,
    },
  ].filter((shelf) => drawn(shelf.source.state));

  const settled = [continueShelf, notRead, fresh].every(
    (source) => source.state.status === "loaded" || source.state.status === "idle",
  );

  if (empty) {
    return <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  }
  if (settled && shelves.length === 0) {
    return <EmptyState icon={BookOpen} title={t("noBooks")} />;
  }

  return (
    <div className="space-y-8">
      {shelves.map(({ id, title, source, href, progress }) => (
        <ShelfBlock
          key={id}
          title={title}
          seeAllHref={href}
          view={viewOf(source.state)}
          onRetry={source.retry}
          renderItem={(item) => (
            <ReadingCard item={item} drive={drive} showProgress={progress} />
          )}
        />
      ))}
    </div>
  );
}
