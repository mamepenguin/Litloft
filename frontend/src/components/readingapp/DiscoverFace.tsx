"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { ShelfBlock, type ShelfView } from "@/components/appshell/ShelfBlock";
import {
  discoverListKey,
  useCardFileLists,
  type CardFileLists,
} from "@/components/appshell/CardFileMenu";
import type { LoadState } from "@/components/appshell/useLoad";
import type { ShelfItem } from "@/lib/api";
import { ReadingCard } from "./ReadingCard";
import { readingShelfHref } from "./shelfLinks";

interface ShelfSource {
  state: LoadState<ShelfItem[]>;
  retry: () => void;
}

function viewOf(
  state: LoadState<ShelfItem[]>,
  items: readonly ShelfItem[],
): ShelfView<ShelfItem> {
  if (state.status === "loaded") return { status: "loaded", items };
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
  const lists = useCardFileLists();
  const shelves = [
    ...(hasProfile
      ? [
          {
            id: "continue",
            title: t("shelves.continue"),
            source: continueShelf,
            href: readingShelfHref(drive, "watch", "continue", undefined, {}, "discover"),
            progress: true,
          },
        ]
      : []),
    {
      id: "notRead",
      title: t("shelves.notReadYet"),
      source: notRead,
      href: hasProfile ? readingShelfHref(drive, "watch", "unwatched", undefined, {}, "discover") : undefined,
      progress: false,
    },
    {
      id: "new",
      title: t("shelves.new"),
      source: fresh,
      href: readingShelfHref(drive, "all", "all", undefined, {}, "discover"),
      progress: false,
    },
  ]
    .map((shelf) => ({ ...shelf, items: filtered(lists, shelf.id, shelf.source) }))
    .filter((shelf) => shelf.items !== null);

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
    <div className="space-y-10">
      {shelves.map(({ id, title, source, href, progress, items }) => (
        <ShelfBlock
          key={id}
          title={title}
          seeAllHref={href}
          view={viewOf(source.state, items ?? [])}
          onRetry={source.retry}
          book
          renderItem={(item) => (
            <ReadingCard
              item={item}
              drive={drive}
              showProgress={progress}
              fileMenu={{ listKey: discoverListKey(id) }}
            />
          )}
        />
      ))}
    </div>
  );
}

/** The shelf's items after menu removals, or null when it has no card to draw. */
function filtered(
  lists: CardFileLists,
  id: string,
  source: ShelfSource,
): ShelfItem[] | null {
  if (!drawn(source.state)) return null;
  if (source.state.status !== "loaded") return [];
  const items = lists.filter(discoverListKey(id), source.state.data);
  return items.length === 0 ? null : items;
}
