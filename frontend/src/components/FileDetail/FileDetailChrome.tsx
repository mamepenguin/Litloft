"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, PanelBottom, PanelBottomClose, PanelRight, PanelRightClose } from "lucide-react";

import { useIsMobile } from "@/hooks/useIsMobile";
import { Breadcrumb } from "../Breadcrumb";
import { InboxDetailActions } from "../inbox/InboxDetailActions";
import {
  FileHeaderRowPortal,
  useFileHeaderRowHost,
} from "../FileHeaderRowProvider";

interface FileDetailChromeProps {
  drive: string;
  folderPath?: string;
  title: string;
  titleNode?: ReactNode;
  fileId?: string;
  onBack?: () => void;
  /**
   * A file that is not known yet has no name, so it has no trail: the row
   * shows the host's back control alone.
   */
  trail?: boolean;
  children?: ReactNode;
  inspector?: {
    open: boolean;
    onToggle: () => void;
    /** The inspector is under the canvas, so its button says bottom. */
    stacked?: boolean;
  };
}

export function FileDetailChrome({
  drive,
  folderPath,
  title,
  titleNode,
  fileId,
  onBack,
  trail = true,
  children,
  inspector,
}: FileDetailChromeProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const ti = useTranslations("inspector");
  // Only for placing `titleNode`. The two width forms of the path are
  // both rendered and hidden in CSS, which needs no measurement — but
  // `titleNode` is a control with state, and two copies of it means the
  // hidden one still fires `blur` when a rotation crosses this
  // breakpoint. For a Markdown note that blur commits a rename, so a
  // half-typed filename would be saved by turning the phone sideways.
  // One instance, placed.
  const isMobile = useIsMobile();
  const hosted = useFileHeaderRowHost() !== null;

  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];
  const parentName = segments.length > 0 ? segments[segments.length - 1] : drive;
  const parentHref =
    segments.length > 0
      ? `/drive/${encodeURIComponent(drive)}/${segments
          .map(encodeURIComponent)
          .join("/")}`
      : `/drive/${encodeURIComponent(drive)}`;

  // "Back to <folder>" is only true when back means "up". A host that
  // supplied `onBack` has said it does not: during collection playback
  // it returns to the collection. Labelling that control with the
  // folder's name would put the same word in the row twice, pointing at
  // two different places, with one of them lying.
  const backLabel = onBack ? tc("back") : t("backTo", { name: parentName });
  const backBody = (
    <>
      <ChevronLeft size={16} className="flex-shrink-0" />
      <span className="truncate">{onBack ? tc("back") : parentName}</span>
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

  // A file that is not known yet has no name; the wide trail still ends in
  // an empty segment so the drive stays a link the reader can leave by.
  const wideLeaf =
    titleNode ?? (title !== "" ? title : <span className="truncate" />);

  const row = (
    <div
      data-testid="file-detail-chrome"
      className={
        hosted
          ? "flex min-w-0 flex-1 items-center gap-2"
          : "flex h-12 shrink-0 items-center gap-2 border-b border-bg-border bg-bg-card px-3"
      }
    >
      {trail ? (
        <>
          {/* Two forms of the same statement, one per width. Rendering both
              and hiding one costs a duplicate DOM node and buys a layout
              that needs no measurement to decide between them.

              Where the host supplied `onBack`, the breadcrumb cannot express
              where back goes, so the control it gave has to survive the width
              at which the breadcrumb takes over. */}
          <div
            className={
              onBack
                ? "flex min-w-0 flex-1 items-center md:max-w-[45%] md:flex-none"
                : "flex min-w-0 flex-1 items-center md:hidden"
            }
          >
            {backControl}
            {/* The leaf comes along below `md`, where the breadcrumb is
                hidden. Dropping the file's name there is what the sizing
                rules ask for — but for a Markdown note the leaf *is* the
                rename control, and dropping a function is not the same as
                dropping a label. */}
            {/* `flex` on a box with one child, and `flex-auto` rather than
                `flex-1`: the rename control is nowrap text, whose minimum
                contribution is the whole filename, so it only narrows as a flex
                item, and only a basis of its own content wins it any width
                against the back control beside it. Without both it lays itself
                out at full length over the buttons to its right. */}
            {isMobile && titleNode && (
              <span className="flex min-w-0 flex-auto md:hidden">{titleNode}</span>
            )}
          </div>
          <div className="hidden min-w-0 flex-1 md:flex">
            <Breadcrumb
              driveName={drive}
              folderPath={folderPath}
              trailingSegment={isMobile ? title : wideLeaf}
            />
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">{backControl}</div>
      )}

      {children}

      {fileId && <InboxDetailActions fileId={fileId} drive={drive} />}

      {inspector && (
        <button
          type="button"
          onClick={inspector.onToggle}
          aria-pressed={inspector.open}
          // On a phone nothing closes: the sheet collapses to a strip
          // that is still on screen, so "close" would describe an
          // outcome the reader does not get.
          aria-label={
            isMobile
              ? inspector.open
                ? ti("collapseSheet")
                : ti("expandSheet")
              : inspector.open
                ? ti("close")
                : ti("openShortcut")
          }
          title={
            isMobile
              ? inspector.open
                ? ti("collapseSheet")
                : ti("expandSheet")
              : inspector.open
                ? ti("close")
                : ti("openShortcut")
          }
          data-testid="inspector-toggle"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          {inspector.open ? (
            inspector.stacked ? (
              <PanelBottomClose size={16} />
            ) : (
              <PanelRightClose size={16} />
            )
          ) : inspector.stacked ? (
            <PanelBottom size={16} />
          ) : (
            <PanelRight size={16} />
          )}
        </button>
      )}

      {/* Separates the file's own row from the header's ordinary controls,
          so it exists only where those controls follow it. */}
      {hosted && <div className="hidden h-5 w-px shrink-0 bg-bg-border md:block" />}
    </div>
  );

  if (!hosted) {
    // No header to draw into: a host outside the shell keeps the row it
    // has always drawn for itself.
    return row;
  }
  return <FileHeaderRowPortal>{row}</FileHeaderRowPortal>;
}
