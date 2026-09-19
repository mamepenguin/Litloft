"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, FilePlus, Home, Star, ThumbsUp } from "lucide-react";
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
import { PageFrame } from "./PageFrame";
import { PageHeader } from "./PageHeader";
import { useProfile } from "./ProfileProvider";

interface DriveHomeProps {
  driveName: string;
}

interface SectionState {
  files: FileItem[];
  /** How many files match the section's query, not how many it holds. */
  total?: number;
  loading: boolean;
}

/**
 * Both fields are needed: the drive alone cannot separate two visits to
 * one drive (A → B → A), and the request id alone passes a stale callback
 * that refetches for a drive the page has already left.
 */
interface ResponseIdentity {
  /** The drive the request was made for, read off the closure that made it. */
  drive: string;
  requestId: number;
}

interface FileSectionsBatch extends ResponseIdentity {
  results: PromiseSettledResult<PaginatedResponse>[];
  /** Only a page load may mark the drive as unreachable; a refresh may not. */
  pageLoad: boolean;
}

const SECTION_LIMIT = 12;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
  const tEmpty = useTranslations("empty");
  const tErrors = useTranslations("errors");
  // The heading reuses the sidebar's key: both name the same place.
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
  // Separate a row empty because its request failed from one empty
  // because the drive holds nothing. Two flags because the file rows are
  // also re-fetched without the watch rows.
  const [fileSectionsFailed, setFileSectionsFailed] = useState(false);
  const [watchHistoryFailed, setWatchHistoryFailed] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);

  // Read only after an `await`, so the effect below has always run by then.
  const shownDriveRef = useRef(driveName);
  useEffect(() => {
    shownDriveRef.current = driveName;
  }, [driveName]);

  // Responses are compared against the newest *applied* request, not the
  // newest dispatched: otherwise a refresh that fails would have already
  // discarded the page load's good response, leaving the rows empty.
  const fileSectionsRequestRef = useRef(0);
  const fileSectionsAppliedRef = useRef(0);
  // The watch rows are fetched only on a page load, so it is their identity.
  const pageLoadRef = useRef(0);

  const applyFileSections = useCallback((batch: FileSectionsBatch) => {
    if (batch.drive !== shownDriveRef.current) return;
    if (batch.requestId < fileSectionsAppliedRef.current) return;

    const { results } = batch;

    // A batch that delivered nothing still clears the skeleton, but must
    // not claim the stream or it would discard a response still in flight.
    const delivered = results.some((result) => result.status === "fulfilled");
    if (delivered) {
      fileSectionsAppliedRef.current = batch.requestId;
    }
    if (delivered) {
      setFileSectionsFailed(false);
    } else if (batch.pageLoad) {
      setFileSectionsFailed(true);
    }
    // A failed request keeps the row's previous contents.
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
      // `allSettled`, not `catch(() => [])`: a failure must stay
      // distinguishable from an empty history.
      hasProfile
        ? Promise.allSettled([
            getWatchHistory(driveName, SECTION_LIMIT),
            getWatchHistory(driveName, SECTION_LIMIT, "all"),
          ])
        : null,
    ]);

    // Applied even if superseded: the rows guard on their own request id.
    applyFileSections(fileResults);

    if (pageLoadRef.current !== pageLoadId) return;
    setPageLoaded(true);

    if (watchResults) {
      const [continueResult, recentlyPlayedResult] = watchResults;
      // Emptied on a rejection: keeping the previous items could show one
      // drive's history under another drive's name.
      setContinueWatching(continueResult.status === "fulfilled" ? continueResult.value : []);
      setContinueWatchingLoading(false);
      setRecentlyPlayed(recentlyPlayedResult.status === "fulfilled" ? recentlyPlayedResult.value : []);
      setRecentlyPlayedLoading(false);
      setWatchHistoryFailed(
        !watchResults.some((result) => result.status === "fulfilled"),
      );
    }
  }, [driveName, fetchFileSections, applyFileSections, hasProfile]);

  // `nickname` is a dependency because the viewer travels in a cookie,
  // not in anything `loadPage` closes over.
  useEffect(() => {
    void loadPage();
  }, [loadPage, nickname]);

  const refetchAllSections = useCallback(async () => {
    applyFileSections(await fetchFileSections(false));
  }, [fetchFileSections, applyFileSections]);

  // `drive.file_updated` too: favouriting is a content update.
  const refreshPage = useCallback(() => {
    void refetchAllSections();
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

  const rowsEmpty =
    recent.files.length === 0 &&
    favorites.files.length === 0 &&
    liked.files.length === 0 &&
    continueWatching.length === 0 &&
    recentlyPlayed.length === 0;
  // Without a profile the watch rows are never requested.
  const everyCoreRequestFailed =
    fileSectionsFailed && (!hasProfile || watchHistoryFailed);

  return (
    // `useFilePicker` dispatches to the `[data-upload-zone]` it finds in
    // the document, so without a page-wide zone the Add menu's upload rows
    // drop files silently.
    <UploadZone
      drive={driveName}
      folderPath=""
      onUploadComplete={refreshPage}
      className="flex w-full min-w-0 flex-1 flex-col"
    >
      {/* No breadcrumb: a trail here would stop at the drive and say
          nothing the scope line does not. Add sits on the header because
          this page has no folder toolbar to carry it. */}
      <PageFrame
        width="full"
        header={
          <PageHeader
            titleIcon={Home}
            title={tSidebar("home")}
            scope={driveName}
            actions={
              <AddButton
                // Rightmost here, unlike the folder toolbar's leftmost one:
                // the menu is wider than its trigger, so anchored left it
                // would grow off the right edge of the page.
                align="right"
                // `fileIds` is empty rather than the files the rows below show:
                // rows that act on a listing's files would otherwise offer to
                // run over a sample this page picked.
                addonProps={{ drive: driveName, path: "", surface: "home", fileIds: [] }}
              />
            }
          />
        }
      >
      <div className="space-y-8 px-4 pb-6 pt-2 sm:pb-8 sm:pt-4">
      {hasProfile && (
        <ContinueWatchingSection
          items={continueWatching}
          loading={continueWatchingLoading}
          // Recently Viewed is this history without the 90% gate, so it
          // is a superset of this row.
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {/* Suggestions sit beside "what you were in the middle of", and do
          not need a profile. */}
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
        icon={<FilePlus size={20} className="text-text-muted" />}
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

      {/* The addon slot is not consulted: core cannot see whether an
          addon row drew anything. */}
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
      </PageFrame>
    </UploadZone>
  );
}
