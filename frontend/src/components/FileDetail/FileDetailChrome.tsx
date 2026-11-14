"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, PanelBottom, PanelBottomClose, PanelRight, PanelRightClose } from "lucide-react";

import { useIsMobile } from "@/hooks/useIsMobile";
import { useMarkdownChrome } from "@/lib/markdownChromeContext";
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
  const isMobile = useIsMobile();
  const hosted = useFileHeaderRowHost() !== null;
  const searchParams = useSearchParams();
  const markdown = useMarkdownChrome();

  // A narrow row gives everything right of the heading to the heading: the
  // Inbox walk has no room for the file's own controls, and a rename needs
  // the space its input would otherwise share.
  const inboxWalk = searchParams.get("nav") === "inbox";
  const renaming = markdown?.renaming ?? false;
  const hideDocumentControls = isMobile && (inboxWalk || renaming);
  const hideInboxActions = isMobile && renaming;

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
      <ChevronLeft size={14} className="flex-shrink-0" />
      <span className="truncate">{onBack ? tc("back") : parentName}</span>
    </>
  );
  const backClass =
    "flex min-w-0 max-w-full items-center gap-1 rounded-lg px-1 py-1 text-xs text-text-muted hover:text-text-primary md:text-sm";
  const backControl = onBack ? (
    <button
      type="button"
      onClick={onBack}
      aria-label={backLabel}
      data-testid="file-detail-back"
      className={backClass}
    >
      {backBody}
    </button>
  ) : (
    <Link
      href={parentHref}
      aria-label={backLabel}
      data-testid="file-detail-back"
      className={backClass}
    >
      {backBody}
    </Link>
  );

  // A file that is not known yet has no name; the wide trail still ends in
  // an empty segment so the drive stays a link the reader can leave by.
  const wideLeaf =
    titleNode ?? (title !== "" ? title : <span className="truncate" />);

  // On a phone the sheet never closes: it collapses to its strip, so a
  // toggle here would have no "closed" state to show.
  const inspectorControl =
    inspector && !isMobile ? (
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
    ) : null;

  // The header's right-hand group spaces its items 4px apart, so 8px more
  // here is the 12px the divider keeps from the profile button.
  const trailing = inspectorControl ? (
    <div className="ml-2 flex shrink-0 items-center gap-3">
      <div className="h-5 w-px bg-bg-border" />
      {inspectorControl}
    </div>
  ) : null;

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
        // Where the host supplied `onBack`, the breadcrumb cannot express
        // where back goes, so the control it gave is drawn beside the trail
        // at every width. Below `md` it takes the heading's first line and
        // the trail's leaf takes the second. `titleNode` lives in that leaf,
        // which stays in the same place in the tree at both widths — two
        // copies of a control with state would fire a hidden copy's `blur` on
        // rotation, and for a note that blur commits the rename.
        <>
          {!isMobile && (
            <div
              className={
                onBack
                  ? "flex min-w-0 items-center md:max-w-[45%] md:flex-none"
                  : "flex min-w-0 items-center md:hidden"
              }
            >
              {backControl}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-1">
            {isMobile && (
              <div className="flex min-w-0 items-center">{backControl}</div>
            )}
            <Breadcrumb
              driveName={drive}
              folderPath={folderPath}
              trailingSegment={wideLeaf}
              compact
            />
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">{backControl}</div>
      )}

      {!hideDocumentControls && children}

      {!hideInboxActions && fileId && (
        <InboxDetailActions fileId={fileId} drive={drive} />
      )}

      {!hosted && inspectorControl}

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
  return (
    <FileHeaderRowPortal
      needs={{ hideHeaderControls: hideDocumentControls }}
      trailing={trailing}
    >
      {row}
    </FileHeaderRowPortal>
  );
}
