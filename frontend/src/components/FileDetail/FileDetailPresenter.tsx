"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot } from "../AddonSlot";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { FilePreview } from "../FilePreview";
import { RelatedFilesSection } from "../RelatedFilesSection";
import { MarkdownDocumentLayout } from "../markdown/MarkdownDocumentLayout";
import { FileDetailCanvas } from "./FileDetailCanvas";
import { InspectorShell } from "./inspector/InspectorShell";
import { RelatedGroup } from "./inspector/RelatedGroup";
import { buildInspectorTabs } from "./inspector/tabs";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

export interface FileDetailPresenterProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  /** Rides the document shell: Markdown with the editor policy on, or any HTML. */
  useDocumentLayout: boolean;
  isHtmlPreview: boolean;
  companionKind: string | null;
  railEligible: boolean;
  companionOccupied: boolean;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  highlight?: string;
  miniPlayerRoot?: Element | null;
  onEnded?: () => void;
  autoPlay?: boolean;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  onRename: (newFilename: string) => Promise<void>;
  /** Host override for the page row's back control; see the container. */
  onBack?: () => void;
  /** Title, meta, action row and tags — placed, not built, here. */
  meta: ReactNode;
}

/**
 * Which shape this file's detail page takes, and nothing else.
 *
 * Two of them today: the document shell (chrome + canvas + inspector),
 * and the legacy vertical stack the other file types still use. Both
 * are handed the same `meta` block and the same addon slot context, so
 * the difference between them is layout only.
 */
export function FileDetailPresenter({
  file,
  fileId,
  drive,
  isMobile,
  useDocumentLayout,
  isHtmlPreview,
  companionKind,
  railEligible,
  companionOccupied,
  chaptersPresent,
  chaptersVersion,
  onChaptersResolved,
  metrics,
  addonSlotProps,
  mediaController,
  onMediaController,
  onDocumentCaptureController,
  videoRef,
  initialTime,
  initialPage,
  highlight,
  miniPlayerRoot,
  onEnded,
  autoPlay,
  markdownReloadKey,
  onMarkdownTagsSaved,
  onRename,
  onBack,
  meta,
}: FileDetailPresenterProps) {
  const tabLabels = useTranslations("inspector.tabs");

  if (useDocumentLayout) {
    // 2026-05-12 inspector consolidation:
    //
    // - The Inspector (and the mobile Bottom Sheet) hosts every
    //   section that fits comfortably in a ~384px column: file meta,
    //   tags, related files, exif, similar-files, comments, plus
    //   residual addon sections (everything except `knowledge-edit`
    //   and `detailed-summary`).
    // - The canvas footer keeps only the **table-/structure-heavy**
    //   summary surface — `ActiveSummaryHost` + intelligence's
    //   `detailed-summary` slot. Both can carry markdown tables that
    //   need canvas width to render without horizontal scroll.
    // - On mobile, the canvas footer is suppressed entirely and the
    //   heavy summaries move into the Bottom Sheet as well: the
    //   90vh × viewport-width drawer is wide enough that tables
    //   degrade gracefully (or scroll horizontally inside the drawer)
    //   without the narrow-inspector problem. This avoids the
    //   "long markdown body keeps the user from finding metadata"
    //   pattern the previous canvas-footer layout had on phones.
    // HTML preview is a pure renderer: intelligence has no concept of
    // "indexing" an HTML artifact, and exposing the empty Suggested-Tags
    // / Summary / Transcript / Index-Details / CLIP-Frames placeholders
    // (plus their global keyboard hint chrome from DetailedSummarySection's
    // Verify mode) would only add noise. Skip the file-detail-sections
    // AddonSlot entirely in HTML mode — the inspector keeps the universal
    // file meta + tags + related + exif + comments stack.
    // Everything below the fixed header. One tab for Markdown and HTML,
    // so no tab strip is drawn and the inspector keeps the shape it has
    // always had — which is what the design asked for.
    const infoTabContent = (
      <>
        {/* One heading over both kinds of relation. Core's own
            `file_relations` and whatever an addon derives from the file
            were two headings answering the same question, so a reader
            had to guess which one a given connection was filed under.
            The addon half arrives through a slot rather than by id:
            core naming `similar-files` here would be exactly the
            core-to-addon dependency the rules forbid, and a slot is the
            generic container that already exists for this. */}
        <RelatedGroup>
          <RelatedFilesSection fileId={fileId} />
          <AddonSlot
            id="file-relations"
            layout="stack"
            props={addonSlotProps}
          />
        </RelatedGroup>
        <ExifSection fileId={fileId} fileType={file.file_type} />
        {!isHtmlPreview && (
          <AddonSlot
            id="file-detail-sections"
            layout="stack"
            excludeIds={["knowledge-edit", "detailed-summary"]}
            props={addonSlotProps}
          />
        )}
        <CommentSection fileId={fileId} />
      </>
    );

    const inspectorTabs = buildInspectorTabs({
      info: { label: tabLabels("info"), content: infoTabContent },
    });

    const inspectorSections = (
      <InspectorShell
        header={meta}
        tabs={inspectorTabs}
        resetKey={fileId}
      />
    );

    const heavySummarySections = (
      <>
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          includeIds={["detailed-summary"]}
          props={addonSlotProps}
        />
      </>
    );

    const inspectorPaneContent = inspectorSections;

    // Mobile Bottom Sheet content: inspector + heavy summaries inline.
    // Built only when actually on mobile so the underlying AddonSlot /
    // CommentSection components mount exactly once across the two
    // surfaces (desktop pane *or* mobile sheet, never both).
    const mobileSheetContent = isMobile ? (
      <div className="space-y-4 p-4">
        {meta}
        {infoTabContent}
        {!isHtmlPreview && heavySummarySections}
      </div>
    ) : undefined;

    return (
      <MarkdownDocumentLayout
        drive={drive}
        folderPath={file.folder_path}
        title={file.filename}
        onRename={isHtmlPreview ? undefined : onRename}
        onBack={onBack}
        inspector={inspectorPaneContent}
        mobileSheet={mobileSheetContent}
        resetKey={fileId}
        previewOnly={isHtmlPreview}
      >
        {/* The canvas is at least as tall as the scroll viewport
            (`flex-1` against the layout's scrolling <main>), and the
            editor region takes whatever the footer leaves. Without
            this, a short note ended at its own content height and the
            sections under it floated in the middle of the screen with
            dead space below. Long notes are unaffected: both boxes
            keep their automatic minimum size and the page scrolls. */}
        <div className="flex flex-1 flex-col">
          <div className="relative isolate flex flex-1 flex-col bg-bg-primary">
            {isHtmlPreview ? (
              <FilePreview file={file} />
            ) : (
              <AddonSlot
                id="file-detail-sections"
                layout="stack"
                includeIds={["knowledge-edit"]}
                props={{ ...addonSlotProps, fillHeight: true }}
              />
            )}
          </div>
          {/* Canvas footer carries the table-heavy summaries on
              desktop only; on mobile the same sections live in the
              Bottom Sheet so the user does not have to scroll past a
              long note to reach them. HTML preview skips the heavy
              summary slot — intelligence does not index HTML and the
              placeholder UI would be misleading. `empty:hidden`
              because both occupants render nothing until the file has
              a summary — the padded, top-bordered strip would
              otherwise be a visible rule floating above the bottom of
              the canvas with nothing under it. */}
          {!isMobile && !isHtmlPreview && (
            <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8 empty:hidden">
              {heavySummarySections}
            </div>
          )}
        </div>
      </MarkdownDocumentLayout>
    );
  }

  // Legacy vertical stack — preserved for non-Markdown files and for
  // drives where the Knowledge editor is policy-disabled. Phase 2's
  // later PRs move this stack into the inspector; this PR only moves
  // it into its own file.
  const rest = (
    <>
      {meta}

      <div className="mt-4 space-y-4">
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        <RelatedFilesSection fileId={fileId} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          props={addonSlotProps}
        />
      </div>

      <CommentSection fileId={fileId} />
    </>
  );

  return (
    <FileDetailCanvas
      file={file}
      fileId={fileId}
      videoRef={videoRef}
      initialTime={initialTime}
      initialPage={initialPage}
      highlight={highlight}
      onMediaController={onMediaController}
      onDocumentCaptureController={onDocumentCaptureController}
      markdownReloadKey={markdownReloadKey}
      onMarkdownTagsSaved={onMarkdownTagsSaved}
      miniPlayerRoot={miniPlayerRoot}
      onEnded={onEnded}
      autoPlay={autoPlay}
      metrics={metrics}
      addonSlotProps={addonSlotProps}
      mediaController={mediaController}
      chaptersPresent={chaptersPresent}
      chaptersVersion={chaptersVersion}
      onChaptersResolved={onChaptersResolved}
      companionKind={companionKind}
      railEligible={railEligible}
      companionOccupied={companionOccupied}
      rest={rest}
    />
  );
}
