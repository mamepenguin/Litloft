"use client";

import { useCallback, useRef } from "react";

import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import {
  discoverListKey,
  useCardFileLists,
  type CardFileLists,
} from "@/components/appshell/CardFileMenu";
import { EmptyState } from "@/components/EmptyState";
import type { ShelfItem } from "@/lib/api";
import { removeCachedItem, restoreCachedItem } from "./discoverCache";
import type { DrawnShelf } from "./useDiscover";
import { useRemovableItems } from "./useRemovableItems";
import { VideoCard, type VideoCardMenu } from "./VideoCard";

const noRetry = () => {};
const EMPTY_ITEMS: ShelfItem[] = [];

function DiscoverShelf({
  shelf,
  viewer,
  isSameViewer,
  lists,
}: {
  shelf: DrawnShelf;
  viewer: string | null;
  isSameViewer: (viewer: string | null) => boolean;
  lists: CardFileLists;
}) {
  const supplied = shelf.state.status === "loaded" ? shelf.state.items : EMPTY_ITEMS;
  const { items, remove, restore } = useRemovableItems(supplied, shelf.cacheKey);
  const cacheKeyRef = useRef(shelf.cacheKey);
  cacheKeyRef.current = shelf.cacheKey;
  const listKey = discoverListKey(shelf.id);
  const shown = lists.filter(listKey, items);

  const onRemoved = useCallback(
    (item: ShelfItem) => {
      if (shelf.cacheKey !== undefined) removeCachedItem(shelf.cacheKey, item.id);
      if (cacheKeyRef.current === shelf.cacheKey) remove(item.id);
    },
    [shelf.cacheKey, remove],
  );

  const onRestored = useCallback(
    (item: ShelfItem) => {
      if (shelf.cacheKey !== undefined) restoreCachedItem(shelf.cacheKey, item.id);
      if (cacheKeyRef.current === shelf.cacheKey) restore(item.id);
    },
    [shelf.cacheKey, restore],
  );

  if (shelf.state.status !== "loaded") {
    return (
      <ShelfBlock<ShelfItem>
        title={shelf.title}
        seeAllHref={shelf.href}
        view={shelf.state}
        onRetry={shelf.retry}
        renderItem={(item) => <VideoCard item={item} byline={shelf.bylines?.get(item.id)} />}
      />
    );
  }

  if (shown.length === 0) return null;

  const menu: VideoCardMenu | undefined =
    shelf.itemActions !== undefined &&
    shelf.itemActions.length > 0 &&
    viewer !== null
      ? {
          actions: shelf.itemActions,
          viewer,
          isSameViewer,
          onRemoved,
          onRestored,
        }
      : undefined;

  return (
    <ShelfBlock<ShelfItem>
      title={shelf.title}
      seeAllHref={shelf.href}
      view={{ status: "loaded", items: shown }}
      onRetry={shelf.retry}
      renderItem={(item) => (
        <VideoCard
          item={item}
          byline={shelf.bylines?.get(item.id)}
          menu={menu}
          fileMenu={{ listKey }}
        />
      )}
    />
  );
}

export function DiscoverFace({
  empty,
  shelves,
  pending,
  viewer = null,
}: {
  drive: string;
  /** The target matches no video, or Continue and New settled with nothing. */
  empty: boolean;
  hasProfile: boolean;
  shelves: DrawnShelf[];
  /** Some position has not settled; draw the single skeleton below the shelves. */
  pending: boolean;
  /** The profile's nickname; item actions need it and check it again on undo. */
  viewer?: string | null;
}) {
  const lists = useCardFileLists();
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const isSameViewer = useCallback(
    (captured: string | null) => viewerRef.current === captured,
    [],
  );

  if (empty) return <EmptyState variant="no-files" />;

  const drawnShelves = shelves.filter(
    (shelf) =>
      shelf.state.status !== "loaded" ||
      lists.filter(discoverListKey(shelf.id), shelf.state.items).length > 0,
  );
  if (!pending && shelves.length > 0 && drawnShelves.length === 0) {
    return <EmptyState variant="no-files" />;
  }

  return (
    <div className="space-y-10">
      {shelves.map((shelf) => (
        <DiscoverShelf
          key={`${shelf.id}\u0000${shelf.cacheKey ?? ""}`}
          shelf={shelf}
          viewer={viewer}
          isSameViewer={isSameViewer}
          lists={lists}
        />
      ))}
      {pending && (
        <ShelfBlock
          title=""
          view={{ status: "loading" }}
          onRetry={noRetry}
          renderItem={() => null}
        />
      )}
    </div>
  );
}
