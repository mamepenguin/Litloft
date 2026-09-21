import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFolderLink } from "@/hooks/useFolderLink";
import { foldTrail } from "@/lib/trail";

/**
 * Every segment of a trail must be able to narrow. A segment's own minimum
 * size is otherwise its label's full length — `truncate` on the label inside
 * makes the label narrowable and says nothing about the box holding it.
 */
export const TRAIL_SEGMENT = "min-w-0";

/**
 * The ancestors narrow first — a shrink factor this large spends the row's
 * deficit on them almost entirely before the last segment, which names where
 * the reader is, gives any of its own.
 *
 * They stop at a floor rather than at zero: a link narrowed to nothing has no
 * hit area, and narrowing is meant to cost legibility, not reach. The floor
 * holds the chevron, the padding and a few characters. Both are exported
 * because the archive's trail is built from buttons and cannot use this
 * component.
 */
export const TRAIL_ANCESTOR = "min-w-12 shrink-[999]";

interface BreadcrumbProps {
  driveName: string;
  folderPath?: string;
  getDropTargetProps?: (targetPath: string) => Record<string, (e: React.DragEvent) => void>;
  isDropTarget?: (targetPath: string) => boolean;
  /**
   * A node is rendered as given, so the caller owns its truncation and
   * styling; a string gets the leaf styling the folder segments use.
   */
  trailingSegment?: ReactNode;
  /**
   * The page names its own location in a heading, so the trail stops at the
   * drive and the drive becomes a Link rather than the leaf.
   */
  driveIsAncestor?: boolean;
}

interface TrailItem {
  /** Drive-relative, and the drop target's path. The drive's own is "". */
  path: string;
  label: string;
  href: string;
}

export function Breadcrumb({
  driveName,
  folderPath,
  getDropTargetProps,
  isDropTarget,
  trailingSegment,
  driveIsAncestor,
}: BreadcrumbProps) {
  const t = useTranslations("toolbar");
  const folderLink = useFolderLink();
  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];
  const driveHref = `/drive/${encodeURIComponent(driveName)}`;

  const items: TrailItem[] = [
    { path: "", label: driveName, href: driveHref },
    ...segments.map((segment, i) => ({
      path: segments.slice(0, i + 1).join("/"),
      label: segment,
      href: `${driveHref}/${segments
        .slice(0, i + 1)
        .map(encodeURIComponent)
        .join("/")}`,
    })),
  ];

  // Where the caller draws its own leaf, or names the location in a heading,
  // every item here is an ancestor.
  const leafIndex = trailingSegment || driveIsAncestor ? -1 : items.length - 1;
  const { before, folded, after } = foldTrail(items, trailingSegment ? 1 : 2);
  // The marker stands where the folded items were, so it leads to the
  // deepest of them: from there the trail is short enough to draw whole.
  const behindMarker = folded[folded.length - 1];

  const segment = (entry: TrailItem, index: number) => {
    const isLeaf = index === leafIndex;
    return (
      <span
        key={entry.path}
        className={`flex items-center gap-1 ${isLeaf ? TRAIL_SEGMENT : TRAIL_ANCESTOR}`}
      >
        <ChevronRight size={14} className="flex-shrink-0" />
        {isLeaf ? (
          <span className="truncate font-medium text-text-primary">{entry.label}</span>
        ) : (
          <Link
            href={entry.href}
            className={`truncate rounded-lg px-1 transition-colors hover:text-text-primary${
              isDropTarget?.(entry.path) ? " ring-2 ring-accent bg-accent/10 text-accent" : ""
            }`}
            {...folderLink(entry.href)}
            {...getDropTargetProps?.(entry.path)}
          >
            {entry.label}
          </Link>
        )}
      </span>
    );
  };

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm text-text-muted">
      <Link href="/" className="flex-shrink-0 hover:text-text-primary" aria-label={t("home")}>
        <Home size={16} />
      </Link>

      {before.map(segment)}

      {behindMarker && (
        <span className="flex flex-shrink-0 items-center gap-1">
          <ChevronRight size={14} className="flex-shrink-0" />
          {/* No drop target: where a drop onto the marker would land is not
              something the row lets the reader predict. */}
          <Link
            href={behindMarker.href}
            aria-label={behindMarker.label}
            title={folded.map((f) => f.label).join(" / ")}
            className="flex-shrink-0 rounded-lg px-1 transition-colors hover:text-text-primary"
            {...folderLink(behindMarker.href)}
          >
            …
          </Link>
        </span>
      )}

      {after.map((entry, i) => segment(entry, before.length + folded.length + i))}

      {trailingSegment && (
        <>
          <ChevronRight size={14} className="flex-shrink-0" />
          {typeof trailingSegment === "string" ? (
            // `title` because this is the one segment that is routinely
            // too long for the row; without it a truncated filename cannot
            // be read at all.
            <span
              className="truncate font-medium text-text-primary"
              title={trailingSegment}
            >
              {trailingSegment}
            </span>
          ) : (
            trailingSegment
          )}
        </>
      )}
    </nav>
  );
}
