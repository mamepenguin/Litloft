"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Clock, Star, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, PaginatedResponse, WatchHistoryItem } from "@/types";
import { getDriveFiles, getWatchHistory } from "@/lib/api";
import { UploadZone } from "@/components/UploadZone";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import { AddButton } from "./AddButton";
import { AddonSlot } from "./AddonSlot";
import { CarouselSection } from "./CarouselSection";
import { ContinueWatchingSection } from "./ContinueWatchingSection";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { TreeToggle } from "./TreeToggle";
import { useProfile } from "./ProfileProvider";

interface DriveHomeProps {
  driveName: string;
}

interface SectionState {
  files: FileItem[];
  /**
   * How many files match the section's query, not how many it holds.
   *
   * `getDriveFiles` returns it in `meta.total` and the row shows at most
   * `SECTION_LIMIT` of them, so this is the only thing that can say how
   * much is past the edge. `undefined` while loading, and after a fetch
   * that failed with nothing already in the row — where it is moot, since
   * a row with no files does not render. A fetch that fails over a row
   * that has files keeps that row's own total rather than dropping it.
   * `CarouselSection` falls back to an unqualified "See all" when it is
   * absent, rather than claiming a number it does not have.
   */
  total?: number;
  loading: boolean;
}

/**
 * The identity every response on this page carries: **which drive it was
 * made for, and which request made it.** Both, because they answer
 * different questions and each leaves a case open on its own.
 *
 * The drive alone cannot separate two visits to one drive. Where one
 * instance is kept across A → B → A, the first visit's request settles
 * on the third render still naming the drive in front of you.
 *
 * The request alone cannot catch a callback captured on one drive and
 * invoked after the page has moved. A handler that awaits a write and
 * then refetches is closed over the drive it was armed on, so it issues
 * a **brand-new** request for the drive that was left — which mints the
 * newest id and so passes any test of "is this the latest request".
 * `onFileAction` on the carousels has that shape.
 *
 * The identity travels with the response rather than being read where the
 * response is applied, so a caller added later has nothing to remember:
 * `applyFileSections` cannot be reached without a batch, and a batch
 * cannot be built without both fields.
 */
interface ResponseIdentity {
  /** The drive the request was made for, read off the closure that made it. */
  drive: string;
  requestId: number;
}

/**
 * One `getDriveFiles` batch.
 *
 * Built in the page's fetch effect, and in `refetchAllSections`, which
 * is what every other way in goes through — a file action on a row, an
 * upload finishing, a socket event arriving with nobody touching the
 * page. So a batch cannot be placed by when it was asked for, and none
 * of those ways in is a page load.
 *
 * `Promise.allSettled` means this resolves even when every request in it
 * failed, so "the batch arrived" is not "the batch delivered anything" —
 * see `applyFileSections`.
 */
interface FileSectionsBatch extends ResponseIdentity {
  results: PromiseSettledResult<PaginatedResponse>[];
  /**
   * Whether this batch is a page load rather than a refresh.
   *
   * What the page says about the drive answering is a fact about the
   * load. A refresh that delivers nothing has not discovered that the
   * drive is unreachable — it has only failed, over a screen that was
   * built from a load that worked.
   */
  pageLoad: boolean;
}

const SECTION_LIMIT = 12;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
  const tEmpty = useTranslations("empty");
  const tErrors = useTranslations("errors");
  // The sidebar's name for this destination, not a second one. The row
  // in the sidebar and the heading on the page name the same place, and
  // two keys for that is two things to keep in step. Same choice as the
  // Library root's title in `FolderBrowser`.
  const tSidebar = useTranslations("sidebar");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const refreshTree = useTreeRefresh();
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<WatchHistoryItem[]>([]);
  const [recentlyPlayedLoading, setRecentlyPlayedLoading] = useState(false);
  const [recent, setRecent] = useState<SectionState>({ files: [], loading: true });
  const [favorites, setFavorites] = useState<SectionState>({ files: [], loading: true });
  const [liked, setLiked] = useState<SectionState>({ files: [], loading: true });
  // A row that is empty because its request failed and a row that is
  // empty because the drive holds nothing are the same row on screen.
  // These two are what separates them. Two and not one, because the
  // file rows are also re-fetched without the watch rows.
  const [fileSectionsFailed, setFileSectionsFailed] = useState(false);
  const [watchHistoryFailed, setWatchHistoryFailed] = useState(false);
  // Whether a page load has come back. One flag and not one per row:
  // every row on this page is written at the same await, so a row's own
  // `loading` cannot say anything the others do not.
  const [pageLoaded, setPageLoaded] = useState(false);

  // The drive the page is showing, as opposed to the drive any given
  // request was made for. Read only after an `await`, so the effect that
  // maintains it has always run by then.
  const shownDriveRef = useRef(driveName);
  useEffect(() => {
    shownDriveRef.current = driveName;
  }, [driveName]);

  // Which request each of this page's streams of responses is waiting on.
  // `++ref.current` mints the id of a new request; the `applied` ref
  // beside it records the id of the last response that actually wrote
  // something.
  //
  // **Newest applied, not newest dispatched.** Dropping everything that
  // is not the newest request in flight means a refresh cancels the page
  // load's own fetch before anyone knows whether the refresh will deliver
  // — and when it does not, the good response is already gone and nothing
  // re-requests it: the rows are left empty for the rest of the visit.
  // Comparing against what has landed instead means a superseded
  // request can be briefly visible but can never be the last word, and
  // a request that delivers nothing takes nothing with it.
  //
  // Same pattern as `useInfiniteScroll`'s `fetchIdRef`, with that one
  // difference.
  const fileSectionsRequestRef = useRef(0);
  const fileSectionsAppliedRef = useRef(0);
  // Bumped by the fetch effect alone. The watch rows are read only
  // there, so a page load is the unit of identity for them.
  const pageLoadRef = useRef(0);

  const applyFileSections = useCallback((batch: FileSectionsBatch) => {
    // The guard sits here rather than in each caller: this is where a
    // response becomes what the page shows, and a batch cannot reach it
    // without carrying both halves of its identity.
    if (batch.drive !== shownDriveRef.current) return;
    if (batch.requestId < fileSectionsAppliedRef.current) return;

    const { results } = batch;

    // `Promise.allSettled` resolves even when all three requests failed,
    // so a batch arriving is not a batch delivering. One that delivered
    // nothing still clears the skeleton — a first load that fails must
    // not leave it spinning — but it must not claim the stream, or it
    // would discard the response still in flight that can.
    const delivered = results.some((result) => result.status === "fulfilled");
    if (delivered) {
      fileSectionsAppliedRef.current = batch.requestId;
    }
    // Anything that delivers clears it; only a load can set it. The
    // drive having answered once is not undone by a later request going
    // missing, and a refresh that arrives after a failed load is the
    // drive answering.
    if (delivered) {
      setFileSectionsFailed(false);
    } else if (batch.pageLoad) {
      setFileSectionsFailed(true);
    }
    // A failed request leaves the row holding what it had. Writing an
    // empty row instead would let a refresh that delivered nothing erase
    // one that did — on the first load there is nothing to keep, so the
    // row still ends up empty and out of the skeleton.
    const section = (
      result: PromiseSettledResult<PaginatedResponse>,
      previous: SectionState,
    ): SectionState =>
      result.status === "fulfilled"
        ? {
            files: result.value.data,
            total: result.value.meta.total,
            loading: false,
          }
        : { ...previous, loading: false };

    setRecent((previous) => section(results[0], previous));
    setFavorites((previous) => section(results[1], previous));
    setLiked((previous) => section(results[2], previous));
  }, []);

  const fetchFileSections = useCallback(async (pageLoad: boolean): Promise<FileSectionsBatch> => {
    const requestId = ++fileSectionsRequestRef.current;
    const drive = driveName;
    const results = await Promise.allSettled([
      getDriveFiles(drive, { sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { favorite: true, sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { liked: true, sort: "liked_at", order: "desc", limit: SECTION_LIMIT }),
    ]);
    return { drive, requestId, pageLoad, results };
  }, [driveName]);

  /**
   * One fetch of everything this page shows.
   *
   * **Nothing here assumes one run per mount**, and a second run for the
   * same drive with the first still in flight cannot be sorted out by
   * comparing drive names — so the rows carry their identity on the
   * response (`ResponseIdentity`) and the watch rows carry theirs on the
   * page load (`pageLoadRef`).
   */
  const loadPage = useCallback(async () => {
    const pageLoadId = ++pageLoadRef.current;
    setPageLoaded(false);
    setRecent({ files: [], loading: true });
    setFavorites({ files: [], loading: true });
    setLiked({ files: [], loading: true });
    if (hasProfile) {
      setContinueWatchingLoading(true);
      setRecentlyPlayedLoading(true);
    }

    const [fileResults, watchResults] = await Promise.all([
      fetchFileSections(true),
      // `allSettled` rather than a `catch` per request: both end with an
      // empty row, but a rejection that becomes `[]` is indistinguishable
      // from a drive nobody has opened anything in, and telling those
      // apart is what the states at the foot of this page are for.
      hasProfile
        ? Promise.allSettled([
            getWatchHistory(driveName, SECTION_LIMIT),
            getWatchHistory(driveName, SECTION_LIMIT, "all"),
          ])
        : null,
    ]);

    // The rows answer to their own request, so they are applied
    // whether or not this page load is still the current one.
    applyFileSections(fileResults);

    // The rest is fetched only here, so this page load is what it
    // answers to.
    if (pageLoadRef.current !== pageLoadId) return;
    setPageLoaded(true);

    if (watchResults) {
      const [continueResult, recentlyPlayedResult] = watchResults;
      // Emptied on a rejection rather than left holding what it had.
      // These rows are fetched only on a page load, and a page load is
      // also how the drive changes, so keeping the previous items would
      // show one drive's history under another drive's name.
      setContinueWatching(continueResult.status === "fulfilled" ? continueResult.value : []);
      setContinueWatchingLoading(false);
      setRecentlyPlayed(recentlyPlayedResult.status === "fulfilled" ? recentlyPlayedResult.value : []);
      setRecentlyPlayedLoading(false);
      setWatchHistoryFailed(
        !watchResults.some((result) => result.status === "fulfilled"),
      );
    }
  }, [driveName, fetchFileSections, applyFileSections, hasProfile]);

  // `nickname` is here and not in `loadPage`: the request carries the
  // viewer in a cookie rather than in an argument, so one reader's
  // history has to be re-fetched for the next even though nothing the
  // callback closes over has changed.
  useEffect(() => {
    void loadPage();
  }, [loadPage, nickname]);

  const refetchAllSections = useCallback(async () => {
    applyFileSections(await fetchFileSections(false));
  }, [fetchFileSections, applyFileSections]);

  // `drive.file_updated` matters here as much as `structure_changed`,
  // because favouriting is a content update, not a structural one, so
  // the Favourites row would otherwise never notice a change made on
  // another device.
  const refreshPage = useCallback(() => {
    void refetchAllSections();
    // The tree pane is on this page — the header draws its toggle — and
    // this is the only thing that tells it the drive changed shape. Both
    // entrances need it: an upload finishing here writes into the drive
    // root, and `drive.structure_changed` can be anything. It reached the
    // tree through the folder grid's refresh, which is not where it
    // belonged.
    refreshTree();
  }, [refetchAllSections, refreshTree]);

  useWebSocketRefresh(
    ["drive.structure_changed", "drive.file_updated"],
    refreshPage,
    driveName,
  );

  const handleRemoveWatchItem = useCallback((fileId: string) => {
    setContinueWatching((prev) => prev.filter((item) => item.id !== fileId));
    setRecentlyPlayed((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  const driveBase = `/drive/${encodeURIComponent(driveName)}`;

  // Every row hides itself when it settles empty, so a drive with
  // nothing in it and a drive nothing could be fetched from both end as
  // a page with only a header on it.
  const rowsEmpty =
    recent.files.length === 0 &&
    favorites.files.length === 0 &&
    liked.files.length === 0 &&
    continueWatching.length === 0 &&
    recentlyPlayed.length === 0;
  // Only the requests this page load actually issued count: without a
  // profile the watch rows are never asked for, so their outcome says
  // nothing about whether the drive answered.
  const everyCoreRequestFailed =
    fileSectionsFailed && (!hasProfile || watchHistoryFailed);

  return (
    // Upload is dispatched to `[data-upload-zone]` found in the document
    // rather than passed down (`useFilePicker`), so the **Add** menu's
    // upload rows do nothing on a page that has no zone under them — the
    // chooser opens, takes the files and drops them silently. The zone is
    // therefore the page's, not a section's, and it names the drive root,
    // which is what this screen's Add acts on (spec
    // 2026-09-12-purpose-oriented-navigation §6.1).
    <UploadZone
      drive={driveName}
      folderPath=""
      onUploadComplete={refreshPage}
      className="flex w-full min-w-0 flex-1 flex-col"
    >
      {/* The same header the folder and file views draw. This screen
          names itself: a trail here would stop at the drive and say
          nothing the scope line does not (spec
          2026-09-12-purpose-oriented-navigation §6.1).

          What the trail did carry was this page's one link to the drive
          picker — the home icon at its head, not the drive chip. That
          link now lives only in the sidebar, which starts closed in
          overlay mode. So with a pointer the picker is a hamburger away
          rather than a press away.

          A keyboard reaches it without opening anything: the closed
          panel is moved off-screen by a transform and marked
          `aria-hidden`, and neither takes its links out of the tab
          order. That is the state WAI-ARIA forbids, it predates this
          change, and it is the sidebar's to fix.

          The tree toggle stays, against the same section of the spec.
          It does not name the subject — it puts the folder tree away,
          and this route mounts that pane, so a reader arriving with the
          tree on would otherwise have nothing here to close it with
          (arbitration 24; `driveHomeTreeClosable.test.tsx`).

          Y-aligned with FolderBrowser's, so the tree toggle sits at the
          same height on the drive root, in a sub folder and on a file.

          Add is on the header because this page draws no folder
          toolbar to carry it, and it is this screen's one accent fill
          (DESIGN.md §2.2) — placed once rather than repeated beside
          anything below it. */}
      <PageHeader
        leading={<TreeToggle drive={driveName} />}
        title={tSidebar("home")}
        scope={driveName}
        actions={
          <AddButton
            // Rightmost here, unlike the folder toolbar's leftmost one:
            // the menu is wider than its trigger, so anchored left it
            // would grow off the right edge of the page.
            align="right"
          />
        }
      />

      <div className="space-y-8 px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4">
      {hasProfile && (
        <ContinueWatchingSection
          items={continueWatching}
          loading={continueWatchingLoading}
          // The same destination Recently Viewed uses, and for the same
          // reason it is needed at all: the row draws only what fits, so
          // without a link the rest of the history is unreachable from
          // here. Recently Viewed is this history without the 90%
          // completion gate — a superset, so nothing a reader came for
          // is missing from it.
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {/* Between the two watch rows, not after them. What fills this
          slot is a suggestion — something to pick up that the reader has
          not already told the page about — so it belongs beside "what
          you were in the middle of" and ahead of the plain record of
          what you opened (spec §6.2, arbitration 7). It is ungated: a
          suggestion does not need a profile to be worth making. */}
      <AddonSlot id="drive-home-sections" props={{ drive: driveName }} />

      {hasProfile && (
        <ContinueWatchingSection
          items={recentlyPlayed}
          loading={recentlyPlayedLoading}
          title={t("recentlyViewed")}
          icon={<History size={20} className="text-text-muted" />}
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      <CarouselSection
        title={t("recentAdded")}
        icon={<Clock size={20} className="text-text-muted" />}
        files={recent.files}
        loading={recent.loading}
        totalCount={recent.total}
        seeAllHref={`${driveBase}?view=recent-added`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("favorites")}
        icon={<Star size={20} className="text-text-muted" />}
        files={favorites.files}
        loading={favorites.loading}
        totalCount={favorites.total}
        seeAllHref={`${driveBase}?view=favorites`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("liked")}
        icon={<ThumbsUp size={20} className="text-text-muted" />}
        files={liked.files}
        loading={liked.loading}
        totalCount={liked.total}
        seeAllHref={`${driveBase}?view=liked`}
        onFileAction={refetchAllSections}
      />

      {/* The addon slot is not consulted. Core cannot see whether an
          addon row drew anything, so a state that an addon's failure
          could trigger would be answering for a section this screen
          does not own.

          Neither state takes the accent fill: Add is on the header in
          both of them and stays this screen's only one. */}
      {pageLoaded && rowsEmpty && (
        everyCoreRequestFailed ? (
          <EmptyState
            variant="home-unavailable"
            secondaryActions={[{ label: tErrors("tryAgain"), onClick: () => void loadPage() }]}
          />
        ) : (
          <EmptyState
            variant="no-home-activity"
            secondaryActions={[
              { label: tEmpty("openLibraryAction"), href: `${driveBase}?view=library` },
            ]}
          />
        )
      )}

      </div>
    </UploadZone>
  );
}
