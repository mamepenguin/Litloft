"use client";

import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { EmptyState } from "@/components/EmptyState";
import type { ShelfItem } from "@/lib/api";
import type { DrawnShelf } from "./useDiscover";
import { VideoCard } from "./VideoCard";

const noRetry = () => {};

export function DiscoverFace({
  empty,
  shelves,
  pending,
}: {
  drive: string;
  /** The target matches no video, or Continue and New settled with nothing. */
  empty: boolean;
  hasProfile: boolean;
  shelves: DrawnShelf[];
  /** Some position has not settled; draw the single skeleton below the shelves. */
  pending: boolean;
}) {
  if (empty) return <EmptyState variant="no-files" />;

  return (
    <div className="space-y-10">
      {shelves.map(({ id, title, href, state, bylines, retry }) => (
        <ShelfBlock<ShelfItem>
          key={id}
          title={title}
          seeAllHref={href}
          view={state}
          onRetry={retry}
          renderItem={(item) => <VideoCard item={item} byline={bylines?.get(item.id)} />}
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
