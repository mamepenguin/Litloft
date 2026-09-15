"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, PanelRight, PanelRightClose } from "lucide-react";

import { useIsMobile } from "@/hooks/useIsMobile";
import { Breadcrumb } from "../Breadcrumb";

interface FileDetailChromeProps {
  drive: string;
  folderPath?: string;
  title: string;
  titleNode?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
  inspector?: {
    open: boolean;
    onToggle: () => void;
  };
}

export function FileDetailChrome({
  drive,
  folderPath,
  title,
  titleNode,
  onBack,
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

  return (
    <div
      data-testid="file-detail-chrome"
      className="flex h-12 shrink-0 items-center gap-2 border-b border-bg-border bg-bg-card px-3"
    >
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
        {isMobile && titleNode && (
          <span className="min-w-0 flex-1 md:hidden">{titleNode}</span>
        )}
      </div>
      <div className="hidden min-w-0 flex-1 md:flex">
        <Breadcrumb
          driveName={drive}
          folderPath={folderPath}
          trailingSegment={isMobile ? title : (titleNode ?? title)}
        />
      </div>

      {children}

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
            <PanelRightClose size={16} />
          ) : (
            <PanelRight size={16} />
          )}
        </button>
      )}
    </div>
  );
}
