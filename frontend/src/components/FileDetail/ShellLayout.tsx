"use client";

import { useCallback, useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { PdfPagesTab } from "./pdf/PdfPagesTab";
import { usePdfState } from "./pdf/usePdfState";
import { ArchivePagesPanel } from "./archive/ArchivePagesPanel";
import { useArchiveState } from "./archive/useArchiveState";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { useMediaLayoutPreference } from "@/lib/mediaLayout";
import { sortSlotEntries } from "@/lib/addons";
import { viewerTakesCanvasFloor } from "@/lib/fileDetailShell";
import { slotEntryLabel } from "@/lib/slotLabel";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot, SlotEntryRenderer } from "../AddonSlot";
import { useAddonSlots } from "../AddonSlotsProvider";
import { ChaptersPanel } from "../ChaptersPanel";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { FileDetailShell } from "../FileDetailShell";
import { FilePreview } from "../FilePreview";
import { MediaLayoutToggle } from "../MediaLayoutToggle";
import { RelatedFilesSection } from "../RelatedFilesSection";
import { MarkdownDocumentLayout } from "../markdown/MarkdownDocumentLayout";
import { FileNavControls } from "./FileNavControls";
import { MediaCanvas } from "./MediaCanvas";
import { InspectorShell } from "./inspector/InspectorShell";
import { RelatedGroup } from "./inspector/RelatedGroup";
import { buildInspectorTabs } from "./inspector/tabs";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";

export interface ShellLayoutProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  isHtmlPreview: boolean;
  /** Whether a player plays this file at all. */
  hasPlayer: boolean;
  /**
   * Whether the canvas is a viewer rather than the Knowledge editor.
   *
   * True for everything the shell carries except a Markdown note and an
   * HTML preview: media, and — since 2026-09 — PDF, archives and images.
   * Not the same question as `hasPlayer`: a PDF has no player, but it
   * has a viewer, and before this the two were conflated because the
   * shell only carried media.
   */
  usesCanvasViewer: boolean;
  /** Whether the canvas owns the description, rather than the inspector. */
  descriptionInCanvas: boolean;
  /** Whether anyone could fill the companion. Decides what is mounted. */
  companionMountable: boolean;
  /** Whether anyone does, for this file. Decides what chrome is drawn. */
  companionOccupied: boolean;
  /** Per-file "have I anything" answers from the slot entries. */
  slotAvailability: SlotAvailability;
  /** Whether the player's height is a function of its width. */
  playerFramed: boolean;
  isTimedMedia: boolean;
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
  /** The shell owns the scroll container; the container needs it back. */
  onScrollRootChange: (node: HTMLElement | null) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  onRename: (newFilename: string) => Promise<void>;
  onBack?: () => void;
  /** Title, meta, action row and tags — placed, not built, here. */
  meta: ReactNode;
  /** The Bottom Sheet's 56px resting row, on the surfaces that have one. */
  sheetPeek?: ReactNode;
}

/**
 * File detail as chrome, canvas and inspector.
 *
 * Every kind that has been moved onto the shell is drawn from here, and
 * the differences between them are two: what goes in the canvas, and
 * which tabs the inspector grows. The fixed part of the inspector, the
 * "Info" tab, the page row and the Bottom Sheet are the same for all of
 * them — which is the point of the shell, and the reason a PDF and a
 * video no longer disagree about where a file's tags live.
 *
 * Media joined in 2026-09. The one structural consequence is worth
 * stating: in the beside form, the companion region stops being a
 * column of a CSS grid and becomes inspector tabs. The measuring
 * machinery it used to drive stays exactly where it was — `--rail-avail`
 * still bounds the box below the player and `--player-avail` was never
 * about the companion at all — and the grid itself is still live on the
 * collection-playback route, which keeps the legacy stack.
 */
export function ShellLayout({
  file,
  fileId,
  drive,
  isMobile,
  isHtmlPreview,
  hasPlayer,
  usesCanvasViewer,
  descriptionInCanvas,
  companionMountable,
  companionOccupied,
  slotAvailability,
  playerFramed,
  isTimedMedia,
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
  onScrollRootChange,
  onEnded,
  autoPlay,
  markdownReloadKey,
  onMarkdownTagsSaved,
  onRename,
  onBack,
  meta,
  sheetPeek,
}: ShellLayoutProps) {
  const tabLabels = useTranslations("inspector.tabs");

  /**
   * The PDF canvas viewer's page state, when the canvas holds one.
   *
   * Same shape as `mediaController`: the canvas publishes it upward, because
   * only the thing that loaded the document knows what is in it, and the
   * inspector's page list is in a different subtree.
   */
  const [pdfController, setPdfController] = useState<PdfController | null>(null);
  const pdfState = usePdfState(pdfController);
  const [archiveController, setArchiveController] =
    useState<ArchiveController | null>(null);
  const archiveState = useArchiveState(archiveController);
  // Global namespace: a slot entry's `i18n_key` names its own addon's.
  const tGlobal = useTranslations();
  const { getSlotEntries } = useAddonSlots();
  const [mediaLayout] = useMediaLayoutPreference();
  // Writing to the store the shell's own toggle reads, rather than
  // holding a second copy of the state: choosing "beside" has to be able
  // to reveal where it just put the panel. The store rather than
  // `useInspectorOpen`, because this only ever writes — subscribing
  // would re-render this whole subtree on every open and close for a
  // value it does not read.
  const setInspectorOpen = useCallback(
    (next: boolean) => inspectorOpenStore.set(drive, next),
    [drive],
  );

  /**
   * Where chapters and the `player-side` occupants are mounted.
   *
   * One value, read by both the tab list and the canvas, because they
   * must not both claim them: the transcript fetches, subscribes to the
   * playback clock and holds a scroll position, so a second copy is not
   * a duplicate render but a second, competing reader of the same file.
   *
   * "Beside" is the inspector's tab strip and "below" is the canvas box.
   * On a phone there is no beside — the inspector is a sheet — so the
   * tabs are where they go regardless of the stored preference, and the
   * page keeps a single scroll.
   */
  const companionInTabs = isMobile || mediaLayout === "beside";
  /**
   * A PDF has a canvas viewer but no playback clock, so nothing follows
   * it: the companion, the tabs it can occupy and the control that moves
   * it between the two are all a *player's*, and a viewer that is not
   * one has none of them. `hasPlayer` and not `usesCanvasViewer` at
   * each.
   *
   * **Three gates, and each has to be able to fail on its own.** There
   * were five. Two of them could not: one read `hasPlayer &&
   * companionOccupied` inside the branch that only runs when
   * `hasPlayer`, and one put `!hasPlayer` into `companionInTabs`, where
   * it was already implied by the gate on the companion itself — so
   * either could be deleted with nothing to show for it, and only
   * deleting *both* of the latter pair changed anything. Belt and braces
   * reads as safety and is the opposite: it is what makes a guard
   * untestable, and an untestable guard is one nobody can tell has
   * stopped working.
   */

  const playerSideEntries = hasPlayer ? getSlotEntries("player-side") : [];

  /**
   * What each `player-side` entry is given, wherever it is placed.
   *
   * `onAvailability` is the entry's channel for saying it has nothing
   * for this file — the generic form of `ChaptersPanel.onResolved`, and
   * the only way core can gate an addon's tab without knowing what the
   * addon is. `labelledByHost` says the host has already written the
   * entry's name above it, so it should not write it again: in the tab
   * strip the button carries the label, and a panel that repeats it
   * spends a line saying what the reader just pressed.
   */
  const playerSideProps = (entryId: string, labelledByHost: boolean) => ({
    ...addonSlotProps,
    fillHeight: true,
    labelledByHost,
    onAvailability: slotAvailability.reporterFor(entryId),
  });

  /**
   * The same occupants, for the below form.
   *
   * Built here rather than by `AddonSlot` inside the canvas because the
   * availability callback is per entry, and `AddonSlot` hands one props
   * object to all of them. Ordering is `AddonSlot`'s own rule, kept.
   */
  const playerSideNodes = sortSlotEntries(playerSideEntries).map((entry) => (
    <SlotEntryRenderer
      key={entry.id}
      entry={entry}
      props={playerSideProps(entry.id, false)}
    />
  ));

  /**
   * The `file-detail-sections` entries the canvas draws itself.
   *
   * The inspector excludes exactly these, so a section lands in one
   * column or the other and never in both — or, as `knowledge-edit`
   * briefly did, in neither: it was excluded from the inspector on
   * every kind while only the document canvas drew it, so a video lost
   * the knowledge addon's "create a note" card entirely.
   *
   * These two ids predate this file and are the only ones core names.
   * Do not add a third: the general answer is a slot of its own, the
   * way `file-relations` is, not another id core has to know.
   */
  const canvasSlotIds = usesCanvasViewer
    ? ["detailed-summary"]
    : ["knowledge-edit", "detailed-summary"];

  // Built twice deliberately: the desktop inspector and the mobile sheet
  // are never mounted at the same time (the pane is desktop-only and the
  // sheet renders nothing while closed), and the sheet takes the
  // table-heavy summaries the desktop canvas keeps — a 90vh drawer at
  // viewport width has room for them, a 384px column does not.
  const heavySummaries = (
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

  // HTML preview is a pure renderer: intelligence has no concept of
  // "indexing" an HTML artifact, so the empty Suggested-Tags / Summary /
  // Index-Details placeholders would be noise rather than affordance.
  const infoTabContent = (withHeavySummaries: boolean) => (
    <>
      {/* One heading over both kinds of relation. Core's own
          `file_relations` and whatever an addon derives from the file
          were two headings answering the same question, so a reader had
          to guess which one a given connection was filed under. The
          addon half arrives through a slot rather than by id: core
          naming `similar-files` here would be exactly the core-to-addon
          dependency the rules forbid. */}
      <RelatedGroup>
        <RelatedFilesSection fileId={fileId} />
        <AddonSlot id="file-relations" layout="stack" props={addonSlotProps} />
      </RelatedGroup>
      <ExifSection fileId={fileId} fileType={file.file_type} />
      {!isHtmlPreview && (
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={canvasSlotIds}
          props={addonSlotProps}
        />
      )}
      <CommentSection fileId={fileId} />
      {withHeavySummaries && !isHtmlPreview && heavySummaries}
    </>
  );

  const buildTabs = (withHeavySummaries: boolean) =>
    buildInspectorTabs({
      info: {
        label: tabLabels("info"),
        content: infoTabContent(withHeavySummaries),
      },
      coreTabs: [
        {
          /**
           * A table of contents, a thumbnail rail, or neither.
           *
           * Null is how a tab is dropped (`buildInspectorTabs` rule 1), so a
           * one-page PDF with no outline grows no tab — and with `info` alone
           * left, no tab strip either (rule 2). The condition is about what
           * the document has, not about what kind of file it is.
           */
          id: "pages",
          label: tabLabels("pages"),
          content: pdfController ? (
            pdfState.numPages > 1 || (pdfState.outline ?? []).length > 0 ? (
              <PdfPagesTab controller={pdfController} />
            ) : null
          ) : archiveController && archiveState.entries.length > 1 ? (
            /* One entry is not an index: the canvas already shows it,
               and rule 1 drops a tab whose content adds nothing. With
               `info` left alone there is then no tab strip either
               (rule 2). */
            <ArchivePagesPanel controller={archiveController} />
          ) : null,
        },
        {
          id: "chapters",
          label: tabLabels("chapters"),
          content:
            companionInTabs && chaptersPresent ? (
              <ChaptersPanel
                fileId={fileId}
                mediaController={mediaController}
                refreshToken={chaptersVersion}
                onResolved={onChaptersResolved}
                className="h-full"
              />
            ) : null,
        },
      ],
      addonTabs: companionInTabs
        ? playerSideEntries.map((entry) => ({
            entry,
            label: slotEntryLabel(entry, tGlobal),
            available: slotAvailability.isAvailable(entry.id),
            // The panel is the height budget, so the occupant fills it
            // and scrolls inside itself. Without the wrapper the flex
            // chain stops here and a transcript lays itself out at full
            // length inside a bounded box, which clips it silently.
            content: (
              <div className="flex h-full min-h-0 flex-col">
                <SlotEntryRenderer
                  entry={entry}
                  props={playerSideProps(entry.id, true)}
                />
              </div>
            ),
          }))
        : [],
    });

  const inspector = (
    <InspectorShell header={meta} tabs={buildTabs(false)} resetKey={fileId} />
  );

  // Only when actually on mobile, so the sections inside mount exactly
  // once across the two surfaces rather than once per surface.
  const mobileSheet = isMobile ? (
    <InspectorShell header={meta} tabs={buildTabs(true)} resetKey={fileId} />
  ) : undefined;

  if (usesCanvasViewer) {
    return (
      <FileDetailShell
        drive={drive}
        folderPath={file.folder_path}
        title={file.title || file.filename}
        onBack={onBack}
        onScrollRootChange={onScrollRootChange}
        canvasFloor={viewerTakesCanvasFloor(file.file_type, file.mime_type)}
        chromeControls={
          <>
            {/* Only where there is something to move. With no chapters
                and no `player-side` occupant the two forms are
                identical, and a control that changes nothing is worse
                than no control. Same value the canvas box is drawn
                from, so the two cannot come to disagree about whether
                the region has an occupant. `!isMobile` is not only
                about space: `onBeside` opens the desktop pane, and a
                phone's sheet is `FileDetailShell`'s own state, not this
                store. Rendering the toggle on a phone would write a
                preference and open nothing. */}
            {!isMobile && hasPlayer && companionOccupied && (
              <MediaLayoutToggle onBeside={() => setInspectorOpen(true)} />
            )}
            {/* Images only. The arrow keys walk the folder for archives,
                PDFs and text as well, but those are surfaces for reading
                into a file, and a pair of arrows in their page row reads
                as the viewer's own paging instead. */}
            {file.file_type === "image" && <FileNavControls />}
          </>
        }
        inspector={inspector}
        mobileSheet={mobileSheet}
        sheetPeek={sheetPeek}
        resetKey={fileId}
      >
        <MediaCanvas
          showDescription={descriptionInCanvas}
          file={file}
          fileId={fileId}
          metrics={metrics}
          framed={playerFramed}
          isTimedMedia={isTimedMedia}
          mediaController={mediaController}
          companion={
            companionInTabs || !hasPlayer || !companionMountable
              ? null
              : {
                  chaptersPresent,
                  occupied: companionOccupied,
                  slots: playerSideNodes,
                }
          }
          chaptersVersion={chaptersVersion}
          onChaptersResolved={onChaptersResolved}
          // On a phone the sheet takes them instead: a 90vh drawer at
          // viewport width has room for a markdown table and a 384px
          // column does not, and drawing them in both places mounts
          // `ActiveSummaryHost` twice — two fetches for one file.
          heavySummaries={isMobile ? null : heavySummaries}
          videoRef={videoRef}
          initialTime={initialTime}
          initialPage={initialPage}
          highlight={highlight}
          onMediaController={onMediaController}
          onDocumentCaptureController={onDocumentCaptureController}
          onPdfController={setPdfController}
          onArchiveController={setArchiveController}
          markdownReloadKey={markdownReloadKey}
          onMarkdownTagsSaved={onMarkdownTagsSaved}
          miniPlayerRoot={miniPlayerRoot}
          onEnded={onEnded}
          autoPlay={autoPlay}
          addonSlotProps={addonSlotProps}
        />
      </FileDetailShell>
    );
  }

  // The document form: a note's own body is the canvas, and the shell's
  // Markdown chrome (save dot, view-mode toggle, click-to-edit filename)
  // comes with it.
  return (
    <MarkdownDocumentLayout
      drive={drive}
      folderPath={file.folder_path}
      title={file.filename}
      onRename={isHtmlPreview ? undefined : onRename}
      onBack={onBack}
      onScrollRootChange={onScrollRootChange}
      inspector={inspector}
      mobileSheet={mobileSheet}
      sheetPeek={sheetPeek}
      resetKey={fileId}
      previewOnly={isHtmlPreview}
    >
      {/* The canvas is at least as tall as the scroll viewport (`flex-1`
          against the layout's scrolling <main>), and the editor region
          takes whatever the footer leaves. Without this, a short note
          ended at its own content height and the sections under it
          floated in the middle of the screen with dead space below.
          Long notes are unaffected: both boxes keep their automatic
          minimum size and the page scrolls. */}
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
        {/* Canvas footer carries the table-heavy summaries on desktop
            only; on mobile the same sections live in the Bottom Sheet so
            the user does not have to scroll past a long note to reach
            them. HTML preview skips them — intelligence does not index
            HTML and the placeholder UI would be misleading. */}
        {!isMobile && !isHtmlPreview && (
          <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8 empty:hidden">
            {heavySummaries}
          </div>
        )}
      </div>
    </MarkdownDocumentLayout>
  );
}
