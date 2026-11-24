"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  getCollections,
  getDriveFiles,
  getDriveFilesWithFileIds,
  getFolders,
  getSmartFolders,
  getWatchHistory,
} from "@/lib/api";
import { getSemanticAvailability } from "@/lib/addons";
import {
  inNamesKey,
  resolveInNames,
  type InNameIo,
} from "@/lib/inNameResolution";
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
  comparisonWireForm,
  filterFromParsed,
  filterQueryParam,
  hasImpossibleConditions,
  hasImpossibleRange,
  parseSearchQuery,
  resolveKinds,
  resolveModified,
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

type InNameState =
  | { key: string; status: "resolving" | "failed" | "tooLarge" | "refused" }
  | {
      key: string;
      status: "resolved";
      collections: string[];
      fileIds: string[] | null;
    };

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
  isContinue: boolean;
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
  /** While an `in:` name is unresolved, failed or too large nothing is listed. */
  inNameBlocked: boolean;
  /** An `in:` query has not produced the first listing page of its resolution yet. */
  inNamePending: boolean;
  inNameState: "failed" | "tooLarge" | "refused" | null;
  retryInName: () => void;
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
  // One `now` per search run, held across renders: a memo may be recomputed
  // by React, which would resolve relative amounts again mid-run and change
  // the listing on every render.
  const runKey = `${searchQuery?.trim() ?? ""}\u0000${typeFilter ?? ""}`;
  const runNow = useRef<{ key: string; now: number } | null>(null);
  if (runNow.current === null || runNow.current.key !== runKey) {
    runNow.current = { key: runKey, now: Date.now() };
  }
  const modifiedNow = runNow.current.now;
  const modifiedNowRef = useRef(modifiedNow);
  modifiedNowRef.current = modifiedNow;
  const modified = useMemo(
    () => resolveModified(parsed, modifiedNow),
    [parsed, modifiedNow],
  );
  const searchKinds = useMemo(
    () => resolveKinds(typeFilter ?? null, parsed.types),
    [typeFilter, parsed],
  );
  const rangeImpossible = useMemo(
    () => hasImpossibleRange(parsed, modified.comparisons),
    [parsed, modified],
  );
  const conditionsImpossible = useMemo(
    () => hasImpossibleConditions(parsed, typeFilter ?? null),
    [parsed, typeFilter],
  );
  const impossible =
    searchKinds.impossible || rangeImpossible || conditionsImpossible;
  const isFavorites = view === "favorites";
  const isRecent = view === "recent" && !isSearch;
  const isContinue = view === "continue" && !isSearch;
  const isWatchHistory = isRecent || isContinue;
  const isRecentAdded = view === "recent-added";
  const isLiked = view === "liked";
  const isAll = view === "all";
  const isSpecialView =
    isFavorites || isWatchHistory || isRecentAdded || isLiked || isAll;

  const snapshotKey = useMemo(
    () => buildListSnapshotKey({ driveName, folderPath, view, tagFilter }),
    [driveName, folderPath, view, tagFilter],
  );

  const inKey = useMemo(() => inNamesKey(driveName, parsed), [driveName, parsed]);
  const [inResolution, setInResolution] = useState<InNameState | null>(() =>
    inKey ? { key: inKey, status: "resolving" } : null,
  );
  const [inRetryToken, setInRetryToken] = useState(0);
  const inResolutionRef = useRef(inResolution);
  inResolutionRef.current = inResolution;
  const resolvedRetryToken = useRef(inRetryToken);
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const resolutionGeneration = useRef(0);

  const [hydration] = useState<{
    initial: { items: FileItem[]; total: number; page: number } | null;
    folders: Folder[] | null;
    scrollY: number | null;
    searchCache: SearchCacheEntry | null;
  }>(() => {
    if (isSearch && searchQuery && parsed.collections.length === 0 && parsed.excludedCollections.length === 0) {
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
      !isWatchHistory &&
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
  const shouldRevalidateHydratedSnapshot =
    hydration.initial != null && !isSearch && !isWatchHistory;

  useEffect(() => {
    if (!inKey) {
      resolutionGeneration.current += 1;
      setInResolution(null);
      return;
    }
    // An impossible stretch requests nothing but keeps what was resolved for
    // this key: only a key change, 再試行 or a reload resolves again.
    if (impossible) return;
    const held = inResolutionRef.current;
    if (
      held?.key === inKey &&
      held.status !== "resolving" &&
      resolvedRetryToken.current === inRetryToken
    ) {
      return;
    }
    resolvedRetryToken.current = inRetryToken;
    const generation = ++resolutionGeneration.current;
    const ctrl = new AbortController();
    setInResolution({ key: inKey, status: "resolving" });
    const io: InNameIo = {
      getCollections,
      getSmartFolders,
      getDriveFiles,
      getSemanticAvailability,
      fetchSemanticHits,
    };
    void (async () => {
      try {
        const outcome = await resolveInNames(
          driveName,
          parsedRef.current,
          ctrl.signal,
          io,
          modifiedNowRef.current,
        );
        if (generation !== resolutionGeneration.current || ctrl.signal.aborted) return;
        setInResolution(
          outcome.status === "resolved"
            ? {
                key: inKey,
                status: "resolved",
                collections: outcome.collections,
                fileIds: outcome.fileIds,
              }
            : { key: inKey, status: outcome.status },
        );
      } catch {
        if (generation !== resolutionGeneration.current || ctrl.signal.aborted) return;
        setInResolution({ key: inKey, status: "failed" });
      }
    })();
    return () => ctrl.abort();
  }, [inKey, inRetryToken, driveName, impossible]);

  const activeResolution =
    inResolution && inResolution.key === inKey ? inResolution : null;
  const inNameBlocked =
    !impossible && inKey !== "" && activeResolution?.status !== "resolved";
  const inNameState =
    activeResolution?.status === "failed" ||
    activeResolution?.status === "tooLarge" ||
    activeResolution?.status === "refused"
      ? activeResolution.status
      : null;
  const resolvedFileIds =
    activeResolution?.status === "resolved" ? activeResolution.fileIds : null;
  const resolvedCollections =
    activeResolution?.status === "resolved"
      ? activeResolution.collections
      : parsed.collections;
  const retryInName = useCallback(() => setInRetryToken((token) => token + 1), []);

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      if (isSearch) {
        // The filename-match backend doesn't understand "relevance";
        // `sortMerged` reorders by hybrid score on the client.
        const backendSort: SortField = sort === "relevance" ? "created_at" : sort;
        const backendOrder: SortOrder = sort === "relevance" ? "desc" : order;
        if (searchKinds.impossible || rangeImpossible || conditionsImpossible || inNameBlocked) {
          return { data: [], total: 0 };
        }
        const kinds = searchKinds.kinds;
        const params = {
          search: parsed.text,
          type: kinds.length === 0 ? undefined : kinds.length === 1 ? kinds[0] : kinds,
          tag: parsed.tags.length > 0 ? parsed.tags : undefined,
          favorite: parsed.favorite ? true : parsed.notFavorite ? false : undefined,
          liked: parsed.liked ? true : parsed.notLiked ? false : undefined,
          folder: parsed.folders.length > 0 ? parsed.folders : undefined,
          collection:
            resolvedCollections.length > 0 ? resolvedCollections : undefined,
          exclude_tag: parsed.excludedTags.length > 0 ? parsed.excludedTags : undefined,
          exclude_type: parsed.excludedTypes.length > 0 ? parsed.excludedTypes : undefined,
          exclude_folder: parsed.excludedFolders.length > 0 ? parsed.excludedFolders : undefined,
          exclude_collection:
            parsed.excludedCollections.length > 0 ? parsed.excludedCollections : undefined,
          has_tag: parsed.hasTag || parsed.noTag ? parsed.hasTag : undefined,
          has_collection:
            parsed.hasCollection || parsed.noCollection ? parsed.hasCollection : undefined,
          ...(parsed.sizes.length > 0
            ? { size: parsed.sizes.map(comparisonWireForm) }
            : {}),
          ...(parsed.durations.length > 0
            ? { duration: parsed.durations.map(comparisonWireForm) }
            : {}),
          ...(modified.wireForms.length > 0
            ? { modified: modified.wireForms }
            : {}),
          trust: trustFilter || undefined,
          sort: backendSort,
          order: backendOrder,
          page,
          limit,
        };
        const res =
          resolvedFileIds !== null
            ? await getDriveFilesWithFileIds(
                driveName,
                params,
                resolvedFileIds,
              )
            : await getDriveFiles(driveName, params);
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
    [isSearch, parsed, modified, searchKinds, rangeImpossible, conditionsImpossible, inNameBlocked, resolvedCollections, resolvedFileIds, driveName, folderPath, sort, order, isFavorites, isSpecialView, isRecentAdded, isLiked, tagFilter, typeFilter, trustFilter],
  );

  // The listing page 1 that answered for the resolution in force. An `in:`
  // query is not listed until one has: the resolution landing does not itself
  // produce rows, and a count of 0 read before then is a wrong count.
  const resolutionInForce = useRef<InNameState | null>(activeResolution);
  resolutionInForce.current = activeResolution;
  const [listedResolution, setListedResolution] = useState<InNameState | null>(null);
  const trackFirstPage = useCallback(
    async (page: number, limit: number) => {
      if (page !== 1 || inKey === "") return fetchPage(page, limit);
      const resolution = resolutionInForce.current;
      try {
        return await fetchPage(page, limit);
      } finally {
        if (
          resolution !== null &&
          resolution.status === "resolved" &&
          resolution === resolutionInForce.current
        ) {
          setListedResolution(resolution);
        }
      }
    },
    [fetchPage, inKey],
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
    fetchPage: trackFirstPage,
    limit: 30,
    disabled: isWatchHistory || inNameBlocked,
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

  const filter = useMemo(() => {
    const built = filterFromParsed(parsed, typeFilter ?? null, modified.wireForms);
    return { ...built, collections: [...resolvedCollections] };
  }, [parsed, typeFilter, resolvedCollections, modified]);
  const filterSignature = parsed.hasOperators ? filterQueryParam(filter) : "";
  const meaningEligible =
    isSearch &&
    parsed.text !== "" &&
    !searchKinds.impossible &&
    !rangeImpossible &&
    !conditionsImpossible &&
    !inNameBlocked;
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
          ...(resolvedFileIds !== null ? { fileIds: resolvedFileIds } : {}),
          signal,
        });
        if (signal?.aborted || requestId !== semanticRequestId.current) return;
        setSemanticHits(answer.ok ? answer.results : []);
        setSemanticFailed(!answer.ok);
        setSemanticLoading(false);
        setSemanticArrived(true);
      })();
    },
    [parsed, driveName, typeFilter, includeSceneClip, filter, resolvedFileIds],
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
    rangeImpossible,
    conditionsImpossible,
    runMeaningSearch,
  ]);

  const retryPassages = useCallback(() => {
    if (!meaningEligible) return;
    runMeaningSearch();
  }, [meaningEligible, runMeaningSearch]);

  const [continuation, setContinuation] = useState<ContinuationAnswer | null>(null);
  // The resolution's identity, not just the filter it produced: two Smart
  // Collection names resolve to the same (empty) `collections` list, so only
  // the key and the retry that resolved it tell their answers apart.
  const continuationKey = [
    parsed.text,
    driveName,
    typeFilter ?? "",
    includeSceneClip ? "scene" : "",
    sort,
    order,
    filterSignature,
    inKey,
    String(inRetryToken),
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
    !searchKinds.impossible &&
    !rangeImpossible &&
    !conditionsImpossible &&
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
        ...(resolvedFileIds !== null ? { fileIds: resolvedFileIds } : {}),
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
    resolvedFileIds,
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
    getWatchHistory(driveName, 50, isContinue ? "continue" : "all", typeFilter).then((items) => {
      const filtered = items.filter((f) => matchesTrustFilter(f, trustFilter));
      setRecentFiles(filtered as FileItem[]);
    }).catch(() => {
      setRecentFiles([]);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, [driveName, typeFilter, trustFilter, hasProfile, isContinue]);

  useEffect(() => {
    if (isWatchHistory) fetchRecentFiles();
  }, [isWatchHistory, fetchRecentFiles]);

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

  const inNameResolving = inNameBlocked && inNameState === null;
  const inNamePending =
    !impossible &&
    inKey !== "" &&
    inNameState === null &&
    (activeResolution?.status !== "resolved" || listedResolution !== activeResolution);
  const computedFiles: FileItemWithMatch[] = isWatchHistory
    ? (recentFiles as FileItemWithMatch[])
    : mergedSearch
      ? [...mergedSearch.files, ...drawnContinuation]
      : (paginatedFiles as FileItemWithMatch[]);
  const computedTotal = isWatchHistory
    ? recentFiles.length
    : mergedSearch
      ? mergedSearch.total
      : paginatedTotal;
  const files = inNameBlocked ? [] : computedFiles;
  const total = inNameBlocked ? 0 : computedTotal;
  // A filtered query's meaning stage is an enhancement over the listing: the
  // listing rows stay visible while the addon ranks within the filter.
  const loading = isWatchHistory
    ? recentLoading
    : inNamePending
      ? true
      : isSearch
        ? paginatedLoading || (semanticLoading && !parsed.hasOperators)
        : paginatedLoading;
  const setFiles = isWatchHistory ? setRecentFiles : setPaginatedFiles;

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
    if (isWatchHistory) {
      fetchRecentFiles();
    } else {
      reset();
      clearListSnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by combinedRefreshKey
  }, [combinedRefreshKey]);

  const passagesEligible =
    isSearch &&
    parsed.text !== "" &&
    !searchKinds.impossible &&
    !rangeImpossible &&
    !conditionsImpossible;
  const passagesApplicable =
    passagesEligible && (!availabilityKnown || semanticAvailable);
  const passagesLoading = meaningEligible
    ? semanticLoading || !semanticArrived || !availabilityKnown
    : inNameResolving;
  const passagesFailed = meaningEligible && semanticFailed;
  const passageGroups = useMemo(
    () => (passagesLoading ? [] : groupPassages(semanticHits)),
    [passagesLoading, semanticHits],
  );

  return {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent, isContinue, hasProfile,
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
    inNameBlocked,
    inNamePending,
    inNameState,
    retryInName,
  };
}
