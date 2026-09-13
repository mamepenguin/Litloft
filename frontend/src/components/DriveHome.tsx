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
import { Breadcrumb } from "./Breadcrumb";
import { CarouselSection } from "./CarouselSection";
import { ContinueWatchingSection } from "./ContinueWatchingSection";
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
 * The drive alone cannot separate two visits to one drive.
 * `/drive/[name]` renders this component with no `key`, so one instance
 * survives A → B → A and the first visit's request settles on the third
 * render still naming the drive in front of you.
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
}

const SECTION_LIMIT = 12;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
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
    if (results.some((result) => result.status === "fulfilled")) {
      fileSectionsAppliedRef.current = batch.requestId;
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

  const fetchFileSections = useCallback(async (): Promise<FileSectionsBatch> => {
    const requestId = ++fileSectionsRequestRef.current;
    const drive = driveName;
    const results = await Promise.allSettled([
      getDriveFiles(drive, { sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { favorite: true, sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { liked: true, sort: "liked_at", order: "desc", limit: SECTION_LIMIT }),
    ]);
    return { drive, requestId, results };
  }, [driveName]);

  /**
   * One fetch of everything this page shows.
   *
   * **Two runs of it can be for the same drive.** Leaving a drive and
   * coming back re-runs it on the same instance — `/drive/[name]` renders
   * this component with no `key`, so nothing unmounts between the two —
   * and the visit being left may still have fetches in flight. A guard
   * comparing drive names sees nothing wrong with the earlier visit's
   * response landing last. That is why the rows carry their identity on
   * the response (`ResponseIdentity`) and the watch rows carry theirs on
   * the page load (`pageLoadRef`), rather than on this effect.
   *
   * `hasProfile` and `nickname` are in its dependencies too, but no
   * screen changes a nickname with this one mounted: the only writer is
   * `settings/ProfileSection`, on a route that is not under
   * `/drive/[name]`.
   *
   * **A known wart, measured and not introduced here**: because the rows
   * are blanked on every run, a re-fetch that fails leaves them empty for
   * the rest of the visit. Reproduces on `origin/develop`.
   */
  useEffect(() => {
    const fetchAll = async () => {
      const pageLoadId = ++pageLoadRef.current;
      setRecent({ files: [], loading: true });
      setFavorites({ files: [], loading: true });
      setLiked({ files: [], loading: true });
      if (hasProfile) {
        setContinueWatchingLoading(true);
        setRecentlyPlayedLoading(true);
      }

      const promises: [
        Promise<FileSectionsBatch>,
        Promise<WatchHistoryItem[]> | null,
        Promise<WatchHistoryItem[]> | null,
      ] = [
        fetchFileSections(),
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT).catch(() => [] as WatchHistoryItem[]) : null,
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT, "all").catch(() => [] as WatchHistoryItem[]) : null,
      ];

      const [fileResults, watchResult, recentlyPlayedResult] = await Promise.all([
        promises[0],
        promises[1] ?? Promise.resolve([] as WatchHistoryItem[]),
        promises[2] ?? Promise.resolve([] as WatchHistoryItem[]),
      ]);

      // The rows answer to their own request, so they are applied
      // whether or not this page load is still the current one.
      applyFileSections(fileResults);

      // The rest is fetched only here, so this page load is what it
      // answers to.
      if (pageLoadRef.current !== pageLoadId) return;

      if (hasProfile) {
        setContinueWatching(watchResult);
        setContinueWatchingLoading(false);
        setRecentlyPlayed(recentlyPlayedResult);
        setRecentlyPlayedLoading(false);
      }
    };

    fetchAll();
  }, [driveName, fetchFileSections, applyFileSections, hasProfile, nickname]);

  const refetchAllSections = useCallback(async () => {
    applyFileSections(await fetchFileSections());
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
      {/* The same header the folder and file views draw, in its titleless
          form: the breadcrumb is the subject here, so `PageHeader` emits
          no `<h1>` and puts the actions on the trail row beside it.
          Y-aligned with FolderBrowser's, so the tree toggle sits at the
          same height on the drive root, in a sub folder and on a file.

          Add is on the header because this page draws no folder
          toolbar to carry it, and it is this screen's one accent fill
          (DESIGN.md §2.2) — placed once rather than repeated beside
          anything below it. */}
      <PageHeader
        leading={<TreeToggle drive={driveName} />}
        breadcrumb={<Breadcrumb driveName={driveName} folderPath="" />}
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
          // The same destination Recently played uses, and for the same
          // reason it is needed at all: the row draws only what fits, so
          // without a link the rest of the history is unreachable from
          // here. Recently played is this history without the 90%
          // completion gate — a superset, so nothing a reader came for
          // is missing from it.
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={recentlyPlayed}
          loading={recentlyPlayedLoading}
          title={t("recentlyPlayed")}
          icon={<History size={20} className="text-text-muted" />}
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      <AddonSlot id="drive-home-sections" props={{ drive: driveName }} />

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

      </div>
    </UploadZone>
  );
}
