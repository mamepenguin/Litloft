"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, PanelRight, PanelRightClose } from "lucide-react";

import { Breadcrumb } from "../Breadcrumb";
import { TreeToggle } from "../TreeToggle";

interface FileDetailChromeProps {
  drive: string;
  /** Drive-relative folder the file sits in; empty at the drive root. */
  folderPath?: string;
  /** Leaf label. Plain text unless `titleNode` replaces it. */
  title: string;
  /**
   * Replacement for the leaf label — a Markdown note hands its
   * click-to-edit filename here. Given to the breadcrumb as its
   * trailing segment, so the folder path above it stays navigable.
   */
  titleNode?: ReactNode;
  /**
   * Overrides the mobile back control. Without it the control is a
   * `Link` to the parent folder, which is what "back" means on this
   * page. The collection surface passes its own handler because there
   * "back" means the collection you came from, not the file's folder.
   */
  onBack?: () => void;
  /** Type-specific controls, between the leaf and the inspector toggle. */
  children?: ReactNode;
  /** Omitted where there is no inspector to toggle. */
  inspector?: {
    open: boolean;
    onToggle: () => void;
  };
  /** The tree pane has no meaning outside the 2-pane host. */
  showTreeToggle?: boolean;
}

/**
 * The one page row every file detail surface wears.
 *
 * Before this there were three of them and none carried a breadcrumb:
 * the 2-pane header showed a bare filename, the Markdown shell showed a
 * filename plus editor controls, and the collection route showed a back
 * link and nothing else — so on a phone the canonical URL had no way
 * back at all (M-6 / MB-3). One row, one answer: the path on a wide
 * screen, its last step on a narrow one.
 *
 * Navigation is `Link` throughout (hako project_spa_navigation): nothing
 * here reloads the app to move one folder up.
 */
export function FileDetailChrome({
  drive,
  folderPath,
  title,
  titleNode,
  onBack,
  children,
  inspector,
  showTreeToggle = true,
}: FileDetailChromeProps) {
  const t = useTranslations("file");
  const ti = useTranslations("inspector");

  // What "up" is from here. A file at the drive root has the drive
  // itself as its parent, which is also what the breadcrumb shows.
  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];
  const parentName = segments.length > 0 ? segments[segments.length - 1] : drive;
  const parentHref =
    segments.length > 0
      ? `/drive/${encodeURIComponent(drive)}/${segments
          .map(encodeURIComponent)
          .join("/")}`
      : `/drive/${encodeURIComponent(drive)}`;

  // The full path does not fit a phone, and the sizing rules forbid
  // wrapping it (00-basis.md). One step up is the part that is actually
  // load-bearing there, so that is the step that survives.
  const backLabel = t("backTo", { name: parentName });
  const backBody = (
    <>
      <ChevronLeft size={16} className="flex-shrink-0" />
      <span className="truncate">{parentName}</span>
    </>
  );
  const backControl = onBack ? (
    <button
      type="button"
      onClick={onBack}
      aria-label={backLabel}
      data-testid="file-detail-back"
      className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-sm text-text-muted hover:text-text-primary"
    >
      {backBody}
    </button>
  ) : (
    <Link
      href={parentHref}
      aria-label={backLabel}
      data-testid="file-detail-back"
      className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-sm text-text-muted hover:text-text-primary"
    >
      {backBody}
    </Link>
  );

  return (
    <div
      data-testid="file-detail-chrome"
      className="flex h-12 shrink-0 items-center gap-2 border-b border-bg-border bg-bg-card px-3"
    >
      {/* TreeToggle is desktop-only — on mobile the layout uses a tree
          ⇄ file-detail screen swap, so the toggle has no visible effect
          here. The back control below is the mobile equivalent. */}
      {showTreeToggle && (
        <div className="hidden md:flex">
          <TreeToggle drive={drive} />
        </div>
      )}

      {/* Two forms of the same statement, one per width. Rendering both
          and hiding one costs a duplicate DOM node and buys a layout
          that needs no measurement to decide between them.

          Except where the host supplied `onBack`. That is a host saying
          the breadcrumb cannot express where back goes — during
          collection playback it is the collection, not the folder this
          track happens to sit in — so the control it gave has to survive
          the width at which the breadcrumb takes over. It shares the row
          there rather than replacing it: the path still answers "where
          is this file", which the collection cannot. */}
      <div
        className={
          onBack
            ? "flex min-w-0 max-w-[45%] flex-1 items-center md:flex-none"
            : "flex min-w-0 flex-1 items-center md:hidden"
        }
      >
        {backControl}
        {/* The leaf goes with it below `md`, where the breadcrumb is
            hidden. Dropping the name there is what the sizing rules ask
            for — but for a Markdown note the leaf *is* the rename
            control, and dropping a function is not the same as dropping
            a label. */}
        {titleNode && <span className="min-w-0 flex-1 md:hidden">{titleNode}</span>}
      </div>
      <div className="hidden min-w-0 flex-1 md:flex">
        <Breadcrumb
          driveName={drive}
          folderPath={folderPath}
          trailingSegment={titleNode ?? title}
        />
      </div>

      {children}

      {inspector && (
        <button
          type="button"
          onClick={inspector.onToggle}
          aria-pressed={inspector.open}
          aria-label={inspector.open ? ti("close") : ti("openShortcut")}
          title={inspector.open ? ti("close") : ti("openShortcut")}
          data-testid="inspector-toggle"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          {inspector.open ? (
            <PanelRightClose size={16} />
          ) : (
            <PanelRight size={16} />
          )}
        </button>
      )}
    </div>
  );
}
