"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getDriveFiles, getFolders, getWatchHistory } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import {
  buildListSnapshotKey,
  clearListSnapshot,
  type ListSnapshot,
} from "@/lib/listSnapshot";
import {
  mergeResults,
  sortMerged,
  type SemanticHit,
} from "@/lib/searchMerge";
import { groupPassages, type PassageGroup } from "@/lib/searchPassages";
import {
  filterFromParsed,
  filterQueryParam,
  parseSearchQuery,
  resolveKinds,
} from "@/lib/searchQuery";
import {
  fetchSemanticHits,
  fetchSemanticImages,
  isSemanticSearchAvailable,
} from "@/lib/semanticSearch";
import {
  readSearchCache,
  type SearchCacheEntry,
} from "@/lib/searchCache";
import type {
  FileItem,
  FileItemWithMatch,
  FileKind,
  Folder,
  SortField,
  SortOrder,
  TrustFilter,
} from "@/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import { useScrollContainer } from "@/lib/scrollContainer";

// A content write can change a title or a thumbnail, which is visible here
// even though the set of files did not change.
const STRUCTURE_EVENTS = ["drive.structure_changed", "drive.file_updated"];

const SEMANTIC_LIMIT = 1000;
const CONTINUATION_PAGE = 100;

export type ContinuationUiState =
  | "hidden"
  | "offered"
  | "loading"
  | "open"
  | "done";

interface ContinuationAnswer {
  key: string;
  status: "idle" | "loading" | "answered";
  results: SemanticHit[];
  revealed: number;
}

const NO_HITS: SemanticHit[] = [];

interface UseFolderFilesParams {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
  typeFilter: FileKind | null;
  trustFilter?: TrustFilter | null;
  sort: SortField;
  order: SortOrder;
  refreshKey: number;
  searchQuery?: string;
  includeSceneClip?: boolean;
  /** Used only on initial mount. */
  initialSnapshot?: ListSnapshot | null;
}

interface UseFolderFilesReturn {
  files: FileItemWithMatch[];
  folders: Folder[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pagesLoaded: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setPaginatedTotal: Dispatch<SetStateAction<number>>;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  isRecent: boolean;
  hasProfile: boolean;
  snapshotKey: string;
  hydratedScrollY: number | null;
  continuationState: ContinuationUiState;
  onShowMore: () => void;
  continuationSentinelRef: React.RefObject<HTMLDivElement | null>;
  continuationDrawnIds: ReadonlySet<string>;
  updateContinuationFile: (file: FileItem) => void;
  removeContinuationFiles: (ids: readonly string[]) => void;
  /** True while the page runs a meaning search the Passages view can show. */
  passagesApplicable: boolean;
  passageGroups: PassageGroup[];
  passagesLoading: boolean;
  passagesFailed: boolean;
  retryPassages: () => void;
}

export function matchesTrustFilter(
  file: Pick<FileItem, "trust_tier" | "trust_reviewed_at" | "trust_unknown">,
  trustFilter: TrustFilter | null | undefined,
): boolean {
  if (!trustFilter) return true;
  // A hit core could not hydrate has no real tier. Admitting it would let it
  // satisfy every filter at once, so it is dropped while one is active.
  if (file.trust_unknown) return false;
  if (trustFilter === "unreviewed") return file.trust_reviewed_at === null;
  return file.trust_tier === trustFilter;
}

function filtersMatchSnapshot(
  snap: ListSnapshot,
  typeFilter: FileKind | null,
  sort: SortField,
  order: SortOrder,
): boolean {
  return (
    snap.filters.sort === sort &&
    snap.filters.order === order &&
    (snap.filters.typeFilter ?? null) === (typeFilter ?? null)
  );
}

export function useFolderFiles({
  driveName, folderPath, view, tagFilter, typeFilter, trustFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot,
}: UseFolderFilesParams): UseFolderFilesReturn {
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const isSearch = !!(searchQuery && searchQuery.trim());
  const parsed = useMemo(() => parseSearchQuery(searchQuery?.trim() ?? ""), [searchQuery]);
  const searchKinds = useMemo(
    () => resolveKinds(typeFilter ?? null, parsed.types),
    [typeFilter, parsed],
  );
  const isFavorites = view === "favorites";
  const isRecent = view === "recent" && !isSearch;
  const isRecentAdded = view === "recent-added";
  const isLiked = view === "liked";
  const isAll = view === "all";
  const isSpecialView = isFavorites || isRecent || isRecentAdded || isLiked || isAll;

  const snapshotKey = useMemo(
    () => buildListSnapshotKey({ driveName, folderPath, view, tagFilter }),
    [driveName, folderPath, view, tagFilter],
  );

  const [hydration] = useState<{
    initial: { items: FileItem[]; total: number; page: number } | null;
    folders: Folder[] | null;
    scrollY: number | null;
    searchCache: SearchCacheEntry | null;
  }>(() => {
    if (isSearch && searchQuery) {
      const cached = readSearchCache({
        drive: driveName,
        query: searchQuery.trim(),
        type: typeFilter,
        includeSceneClip: !!includeSceneClip,
      });
      if (cached) {
        return {
          initial: {
            items: cached.filenameMatches,
            total: cached.filenameTotal,
            page: 1,
          },
          folders: null,
          scrollY: null,
          searchCache: cached,
        };
      }
    }

    const snap = initialSnapshot;
    // Search mode must never hydrate from a folder/view snapshot:
    // snapshotKey doesn't include searchQuery, so the root drive
    // page's snapshot would otherwise hydrate the search page with
    // stale (non-matching) items.
    if (
      snap &&
      !isRecent &&
      !isSearch &&
      snap.key === snapshotKey &&
      filtersMatchSnapshot(snap, typeFilter, sort, order)
    ) {
      return {
        initial: {
          items: snap.items,
          total: snap.total,
          page: Math.max(1, snap.pagesLoaded),
        },
        folders: snap.folders,
        scrollY: snap.scrollY,
        searchCache: null,
      };
    }
    return { initial: null, folders: null, scrollY: null, searchCache: null };
  });

  const [folders, setFolders] = useState<Folder[]>(() => hydration.folders ?? []);
  const shouldRevalidateHydratedSnapshot = hydration.initial != null && !isSearch && !isRecent;

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      if (isSearch) {
        // The filename-match backend doesn't understand "relevance";
        // `sortMerged` reorders by hybrid score on the client.
        const backendSort: SortField = sort === "relevance" ? "created_at" : sort;
        const backendOrder: SortOrder = sort === "relevance" ? "desc" : order;
        if (searchKinds.impossible) return { data: [], total: 0 };
        const kinds = searchKinds.kinds;
        const res = await getDriveFiles(driveName, {
          search: parsed.text,
          type: kinds.length === 0 ? undefined : kinds.length === 1 ? kinds[0] : kinds,
          tag: parsed.tags.length > 0 ? parsed.tags : undefined,
          favorite: parsed.favorite ? true : undefined,
          liked: parsed.liked ? true : undefined,
          trust: trustFilter || undefined,
          sort: backendSort,
          order: backendOrder,
          page,
          limit,
        });
        return { data: res.data, total: res.meta.total };
      }
      const res = await getDriveFiles(driveName, {
        // The folder path is passed straight through, `""` included: a
        // **non-recursive** `path=""` is an exact `folder_path` match and
        // so asks for the root's own children, while omitting `path`
        // applies no folder predicate and asks for the whole drive.
        // `path=""` *with* `recursive` is the drive again.
        path: isSpecialView ? undefined : folderPath,
        recursive: !!tagFilter,
        favorite: isFavorites ? true : undefined,
        liked: isLiked ? true : undefined,
        tag: tagFilter || undefined,
        type: typeFilter || undefined,
        trust: trustFilter || undefined,
        sort: isRecentAdded ? "created_at" : isLiked ? "liked_at" : sort,
        order: isRecentAdded || isLiked ? "desc" : order,
        page,
        limit,
      });
      return { data: res.data, total: res.meta.total };
    },
    [isSearch, parsed, searchKinds, driveName, folderPath, sort, order, isFavorites, isSpecialView, isRecentAdded, isLiked, tagFilter, typeFilter, trustFilter],
  );

  const {
    items: paginatedFiles,
    total: paginatedTotal,
    loading: paginatedLoading,
    loadingMore,
    hasMore,
    pagesLoaded,
    sentinelRef,
    reset,
    setItems: setPaginatedFiles,
    setTotal: setPaginatedTotal,
  } = useInfiniteScroll<FileItem>({
    fetchPage,
    limit: 30,
    disabled: isRecent,
    initial: hydration.initial,
    revalidateInitial: shouldRevalidateHydratedSnapshot,
  });

  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>(
    () => hydration.searchCache?.semanticHits ?? [],
  );
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticAvailable, setSemanticAvailable] = useState(false);
  const [availabilityKnown, setAvailabilityKnown] = useState(false);
  const [semanticArrived, setSemanticArrived] = useState(false);
  const [semanticFailed, setSemanticFailed] = useState(false);

  const filter = useMemo(
    () => filterFromParsed(parsed, typeFilter ?? null),
    [parsed, typeFilter],
  );
  const filterSignature = parsed.hasOperators ? filterQueryParam(filter) : "";
  const meaningEligible =
    isSearch && parsed.text !== "" && !searchKinds.impossible;
  const previousSemanticRef = useRef<{ key: string } | null>(null);
  const semanticRequestId = useRef(0);

  const runMeaningSearch = useCallback(
    (signal?: AbortSignal) => {
      const requestId = ++semanticRequestId.current;
      const filtered = parsed.hasOperators;
      setAvailabilityKnown(false);
      setSemanticLoading(true);
      setSemanticArrived(false);
      setSemanticFailed(false);
      (async () => {
        const available = await isSemanticSearchAvailable(driveName);
        if (signal?.aborted || requestId !== semanticRequestId.current) return;
        setAvailabilityKnown(true);
        setSemanticAvailable(available);
        if (!available) {
          setSemanticHits([]);
          setSemanticLoading(false);
          setSemanticArrived(true);
          return;
        }
        const answer = await fetchSemanticHits(parsed.text, driveName, {
          limit: SEMANTIC_LIMIT,
          passages: true,
          ...(filtered
            ? { filter }
            : { type: typeFilter, includeSceneClip }),
          signal,
        });
        if (signal?.aborted || requestId !== semanticRequestId.current) return;
        setSemanticHits(answer.ok ? answer.results : []);
        setSemanticFailed(!answer.ok);
        setSemanticLoading(false);
        setSemanticArrived(true);
      })();
    },
    [parsed, driveName, typeFilter, includeSceneClip, filter],
  );

  useEffect(() => {
    if (!meaningEligible) {
      semanticRequestId.current += 1;
      setSemanticHits([]);
      setSemanticLoading(false);
      setSemanticAvailable(false);
      setAvailabilityKnown(false);
      setSemanticArrived(false);
      setSemanticFailed(false);
      previousSemanticRef.current = null;
      return;
    }
    const semanticKey = `${parsed.text}\u0000${filterSignature}\u0000${includeSceneClip ? 1 : 0}\u0000${typeFilter ?? ""}`;
    const previous = previousSemanticRef.current;
    previousSemanticRef.current = { key: semanticKey };
    if (previous && previous.key !== semanticKey) {
      setSemanticHits([]);
    }
    const ctrl = new AbortController();
    runMeaningSearch(ctrl.signal);
    return () => {
      ctrl.abort();
    };
  }, [
    meaningEligible,
    parsed,
    filterSignature,
    searchQuery,
    driveName,
    typeFilter,
    includeSceneClip,
    searchKinds.impossible,
    runMeaningSearch,
  ]);

  const retryPassages = useCallback(() => {
    if (!meaningEligible) return;
    runMeaningSearch();
  }, [meaningEligible, runMeaningSearch]);

  const [continuation, setContinuation] = useState<ContinuationAnswer | null>(null);
  const continuationKey = [
    parsed.text,
    driveName,
    typeFilter ?? "",
    includeSceneClip ? "scene" : "",
    sort,
    order,
    filterSignature,
  ].join("\u0000");
  const continuationKeyRef = useRef(continuationKey);
  continuationKeyRef.current = continuationKey;
  const activeContinuation =
    continuation && continuation.key === continuationKey ? continuation : null;
  const continuationResults =
    activeContinuation?.status === "answered" ? activeContinuation.results : NO_HITS;
  const continuationRows = useMemo(
    () =>
      continuationResults.length === 0
        ? []
        : mergeResults({
            filenameMatches: [],
            semanticHits: continuationResults,
            filenameTotal: 0,
            nameMatched: false,
          }).files,
    [continuationResults],
  );
  const continuationSentinelRef = useRef<HTMLDivElement | null>(null);
  const revealMore = useCallback(() => {
    setContinuation((prev) =>
      prev && prev.key === continuationKeyRef.current && prev.status === "answered"
        ? { ...prev, revealed: prev.revealed + CONTINUATION_PAGE }
        : prev,
    );
  }, []);

  const updateContinuationFile = useCallback((file: FileItem) => {
    setContinuation((prev) =>
      prev && prev.key === continuationKeyRef.current && prev.status === "answered"
        ? {
            ...prev,
            results: prev.results.map((hit) =>
              hit.file_id === file.id ? { ...hit, file } : hit,
            ),
          }
        : prev,
    );
  }, []);

  const removeContinuationFiles = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    const dropped = new Set(ids);
    setContinuation((prev) =>
      prev && prev.key === continuationKeyRef.current
        ? {
            ...prev,
            results: prev.results.filter((hit) => !dropped.has(hit.file_id)),
          }
        : prev,
    );
  }, []);

  const canOfferContinuation =
    isSearch &&
    parsed.text !== "" &&
    semanticAvailable &&
    (!includeSceneClip || parsed.hasOperators) &&
    sort === "relevance" &&
    !hasMore &&
    !paginatedLoading &&
    !loadingMore &&
    semanticArrived &&
    semanticHits.some((hit) => hit.match_types?.includes("clip_thumbnail"));

  const onShowMore = useCallback(() => {
    if (!canOfferContinuation) return;
    if (activeContinuation && activeContinuation.status !== "idle") return;
    const key = continuationKey;
    const query = parsed.text;
    setContinuation({ key, status: "loading", results: [], revealed: 0 });
    (async () => {
      const answer = await fetchSemanticImages(query, driveName, {
        ...(parsed.hasOperators ? { filter } : { type: typeFilter }),
      });
      if (continuationKeyRef.current !== key) return;
      if (!answer.ok) {
        setContinuation({ key, status: "idle", results: [], revealed: 0 });
        return;
      }
      setContinuation({
        key,
        status: "answered",
        results: answer.results,
        revealed: CONTINUATION_PAGE,
      });
    })();
  }, [
    canOfferContinuation,
    activeContinuation,
    continuationKey,
    parsed.text,
    parsed.hasOperators,
    filter,
    driveName,
    typeFilter,
  ]);

  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchRecentFiles = useCallback(() => {
    if (!hasProfile) {
      setRecentFiles([]);
      return;
    }
    setRecentLoading(true);
    // The kind goes to the server: `file_type` is a column that never
    // holds `markdown` or `pdf`. Trust has no server parameter on this
    // endpoint.
    getWatchHistory(driveName, 50, "all", typeFilter).then((items) => {
      const filtered = items.filter((f) => matchesTrustFilter(f, trustFilter));
      setRecentFiles(filtered as FileItem[]);
    }).catch(() => {
      setRecentFiles([]);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, [driveName, typeFilter, trustFilter, hasProfile]);

  useEffect(() => {
    if (isRecent) fetchRecentFiles();
  }, [isRecent, fetchRecentFiles]);

  const mergedSearch = useMemo(() => {
    if (!isSearch) return null;
    const merged = mergeResults({
      filenameMatches: paginatedFiles,
      semanticHits,
      filenameTotal: paginatedTotal,
      nameMatched: parsed.text !== "",
    });
    // The semantic source cannot take the `trust` parameter, so its hits
    // arrive unfiltered.
    const kept = merged.files.filter((f) => matchesTrustFilter(f, trustFilter));
    return {
      files: sortMerged(kept, sort, order),
      total: merged.total - (merged.files.length - kept.length),
    };
  }, [isSearch, parsed.text, paginatedFiles, semanticHits, paginatedTotal, sort, order, trustFilter]);

  const aboveContinuationIds = useMemo(
    () => new Set((mergedSearch?.files ?? []).map((f) => f.id)),
    [mergedSearch],
  );
  const drawableContinuation = useMemo(
    () =>
      continuationRows.filter(
        (f) => !aboveContinuationIds.has(f.id) && matchesTrustFilter(f, trustFilter),
      ),
    [continuationRows, aboveContinuationIds, trustFilter],
  );
  const revealedContinuation = activeContinuation?.revealed ?? 0;
  const filenameComplete = !hasMore && !paginatedLoading && !loadingMore;
  const drawnContinuation = filenameComplete
    ? drawableContinuation.slice(0, revealedContinuation)
    : [];
  const continuationDrawnIds = new Set(drawnContinuation.map((f) => f.id));
  const continuationState: ContinuationUiState =
    activeContinuation?.status === "loading"
      ? "loading"
      : activeContinuation?.status === "answered"
        ? filenameComplete
          ? drawableContinuation.length > revealedContinuation
            ? "open"
            : "done"
          : "hidden"
        : canOfferContinuation
          ? "offered"
          : "hidden";

  const scrollContainer = useScrollContainer();
  useEffect(() => {
    if (continuationState !== "open") return;
    const el = continuationSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) revealMore();
      },
      { root: scrollContainer?.current ?? null, rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [continuationState, revealMore, scrollContainer, revealedContinuation]);

  const files: FileItemWithMatch[] = isRecent
    ? (recentFiles as FileItemWithMatch[])
    : mergedSearch
      ? [...mergedSearch.files, ...drawnContinuation]
      : (paginatedFiles as FileItemWithMatch[]);
  const total = isRecent
    ? recentFiles.length
    : mergedSearch
      ? mergedSearch.total
      : paginatedTotal;
  // A filtered query's meaning stage is an enhancement over the listing: the
  // listing rows stay visible while the addon ranks within the filter.
  const loading = isRecent
    ? recentLoading
    : isSearch
      ? paginatedLoading || (semanticLoading && !parsed.hasOperators)
      : paginatedLoading;
  const setFiles = isRecent ? setRecentFiles : setPaginatedFiles;

  const hydratedFoldersRef = useRef(hydration.folders != null);
  useEffect(() => {
    if (isSearch) {
      setFolders([]);
      return;
    }
    if (!isSpecialView && !tagFilter) {
      if (hydratedFoldersRef.current && !shouldRevalidateHydratedSnapshot) {
        hydratedFoldersRef.current = false;
        return;
      }
      hydratedFoldersRef.current = false;
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter, isSearch, shouldRevalidateHydratedSnapshot]);

  // On first render after hydration the key matches, so neither reset nor the
  // scrollTo fires — which is exactly what we want for restoration.
  const prevResetKeyRef = useRef("");
  useEffect(() => {
    const key = `${driveName}|${folderPath}|${view}|${tagFilter}|${typeFilter}|${sort}|${order}|${searchQuery ?? ""}`;
    if (prevResetKeyRef.current && prevResetKeyRef.current !== key) {
      reset();
      clearListSnapshot();
      window.scrollTo({ top: 0 });
    }
    prevResetKeyRef.current = key;
  }, [driveName, folderPath, view, tagFilter, typeFilter, sort, order, searchQuery, reset]);

  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  useWebSocketRefresh(
    STRUCTURE_EVENTS,
    () => {
      setWsRefreshKey((k) => k + 1);
    },
    driveName,
  );
  const combinedRefreshKey = refreshKey + wsRefreshKey;
  useEffect(() => {
    if (combinedRefreshKey === 0) return;
    if (!isSearch && !isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    }
    if (isRecent) {
      fetchRecentFiles();
    } else {
      reset();
      clearListSnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by combinedRefreshKey
  }, [combinedRefreshKey]);

  const passagesApplicable =
    meaningEligible && (!availabilityKnown || semanticAvailable);
  const passagesLoading =
    meaningEligible &&
    (semanticLoading || !semanticArrived || !availabilityKnown);
  const passagesFailed = meaningEligible && semanticFailed;
  const passageGroups = useMemo(
    () => (passagesLoading ? [] : groupPassages(semanticHits)),
    [passagesLoading, semanticHits],
  );

  return {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent, hasProfile,
    snapshotKey,
    hydratedScrollY: hydration.scrollY,
    continuationState,
    onShowMore,
    continuationSentinelRef,
    continuationDrawnIds,
    updateContinuationFile,
    removeContinuationFiles,
    passagesApplicable,
    passageGroups,
    passagesLoading,
    passagesFailed,
    retryPassages,
  };
}
