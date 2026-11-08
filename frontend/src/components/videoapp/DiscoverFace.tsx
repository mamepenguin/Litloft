"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import type { ShelfItem } from "@/lib/api";
import { ShelfBlock, type ShelfView } from "./ShelfBlock";
import type { LoadState } from "./useLoad";

interface ShelfSource {
  state: LoadState<ShelfItem[]>;
  retry: () => void;
}

function viewOf(state: LoadState<ShelfItem[]>): ShelfView {
  if (state.status === "loaded") return { status: "loaded", items: state.data };
  if (state.status === "failed") return { status: "failed" };
  return { status: "loading" };
}

/** A shelf with nothing to show is not drawn; one still loading or failed is. */
function drawn(state: LoadState<ShelfItem[]>): boolean {
  return state.status !== "idle" && !(state.status === "loaded" && state.data.length === 0);
}

export function DiscoverFace({
  empty,
  hasProfile,
  continueShelf,
  recommended,
  fresh,
}: {
  /** The target matches no video. */
  empty: boolean;
  hasProfile: boolean;
  continueShelf: ShelfSource;
  recommended: ShelfSource;
  fresh: ShelfSource;
}) {
  const t = useTranslations("videoApp.shelves");
  const shelves = [
    ...(hasProfile ? [{ id: "continue", title: t("continue"), source: continueShelf }] : []),
    { id: "recommended", title: t("recommended"), source: recommended },
    { id: "new", title: t("new"), source: fresh },
  ].filter((shelf) => drawn(shelf.source.state));

  const settled = [continueShelf, recommended, fresh].every(
    (source) => source.state.status === "loaded" || source.state.status === "idle",
  );
  if (empty || (settled && shelves.length === 0)) return <EmptyState variant="no-files" />;

  return (
    <div className="space-y-8">
      {shelves.map(({ id, title, source }) => (
        <ShelfBlock
          key={id}
          title={title}
          view={viewOf(source.state)}
          onRetry={source.retry}
        />
      ))}
    </div>
  );
}
