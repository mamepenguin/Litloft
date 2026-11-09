"use client";

import { useTranslations } from "next-intl";

import { ShelfBlock, type ShelfView } from "@/components/appshell/ShelfBlock";
import { EmptyState } from "@/components/EmptyState";
import type { ShelfItem } from "@/lib/api";
import type { LoadState } from "@/components/appshell/useLoad";
import { videoShelfHref } from "./shelfLinks";
import { DISCOVER_SHELF_SIZE, type AddonShelf } from "./useDiscover";
import { VideoCard } from "./VideoCard";

interface ShelfSource {
  state: LoadState<ShelfItem[]>;
  retry: () => void;
}

interface DrawnShelf {
  id: string;
  title: string;
  source: ShelfSource;
  href?: string;
  /** A provider shelf holds a bounded list, so it draws all of it. */
  capacity?: number;
}

function viewOf(state: LoadState<ShelfItem[]>): ShelfView<ShelfItem> {
  if (state.status === "loaded") return { status: "loaded", items: state.data };
  if (state.status === "failed") return { status: "failed" };
  return { status: "loading" };
}

/** A core shelf with nothing to show is not drawn; one still loading or failed is. */
function drawn(state: LoadState<ShelfItem[]>): boolean {
  return state.status !== "idle" && !(state.status === "loaded" && state.data.length === 0);
}

/** A provider shelf has no skeleton and no retry: it is drawn only once it holds an item. */
function providerDrawn(state: LoadState<ShelfItem[]>): boolean {
  return state.status === "loaded" && state.data.length > 0;
}

export function DiscoverFace({
  drive,
  empty,
  hasProfile,
  continueShelf,
  recommended,
  addonShelves,
  fresh,
}: {
  drive: string;
  /** The target matches no video. */
  empty: boolean;
  hasProfile: boolean;
  continueShelf: ShelfSource;
  recommended: ShelfSource;
  addonShelves: AddonShelf[];
  fresh: ShelfSource;
}) {
  const t = useTranslations("videoApp.shelves");
  const shelves: DrawnShelf[] = [];

  if (hasProfile && drawn(continueShelf.state)) {
    shelves.push({
      id: "continue",
      title: t("continue"),
      source: continueShelf,
      href: videoShelfHref(drive, "watch", "in_progress", undefined, "discover"),
    });
  }
  if (hasProfile && providerDrawn(recommended.state)) {
    shelves.push({
      id: "recommended",
      title: t("recommended"),
      source: recommended,
      capacity: DISCOVER_SHELF_SIZE,
    });
  }
  for (const shelf of addonShelves) {
    if (providerDrawn(shelf.state)) {
      shelves.push({
        id: shelf.id,
        title: shelf.title,
        source: shelf,
        href: shelf.href,
        capacity: DISCOVER_SHELF_SIZE,
      });
    }
  }
  if (drawn(fresh.state)) {
    shelves.push({
      id: "new",
      title: t("new"),
      source: fresh,
      href: videoShelfHref(drive, "all", "all", undefined, "discover"),
    });
  }

  const coreSettled = [continueShelf, fresh].every(
    (source) => source.state.status === "loaded" || source.state.status === "idle",
  );
  const coreEmpty = [continueShelf, fresh].every(
    (source) =>
      source.state.status === "idle" ||
      (source.state.status === "loaded" && source.state.data.length === 0),
  );
  if (empty || (coreSettled && coreEmpty)) return <EmptyState variant="no-files" />;

  return (
    <div className="space-y-8">
      {shelves.map(({ id, title, source, href, capacity }) => (
        <ShelfBlock
          key={id}
          title={title}
          seeAllHref={href}
          view={viewOf(source.state)}
          onRetry={source.retry}
          capacity={capacity}
          renderItem={(item) => <VideoCard item={item} />}
        />
      ))}
    </div>
  );
}
