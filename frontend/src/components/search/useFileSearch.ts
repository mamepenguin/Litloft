"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCollections,
  getDriveFiles,
  getDriveFilesWithFileIds,
  getSmartFolders,
} from "@/lib/api";
import { getSemanticAvailability } from "@/lib/addons";
import {
  inNamesKey,
  resolveInNames,
  type InNameIo,
} from "@/lib/inNameResolution";
import { fetchSemanticHits, isSemanticSearchAvailable } from "@/lib/semanticSearch";
import { mergeResults, sortMerged, type SemanticHit } from "@/lib/searchMerge";
import { readSearchCache, writeSearchCache, type SearchCacheKey } from "@/lib/searchCache";
import {
  comparisonWireForm,
  filterFromParsed,
  hasImpossibleRange,
  parseSearchQuery,
  resolveKinds,
  resolveModified,
  type ParsedQuery,
  type SearchFilter,
} from "@/lib/searchQuery";
import type { FileItemWithMatch, FileKind } from "@/types";

const POPUP_LIMIT = 8;

/** The listing call for a parsed query; a query without operators sends what it always did. */
function listingParams(
  parsed: ParsedQuery,
  kinds: FileKind[],
  collections: readonly string[] = parsed.collections,
  modified: readonly string[] = [],
) {
  return {
    search: parsed.text,
    limit: POPUP_LIMIT,
    ...(kinds.length > 0 ? { type: kinds.length === 1 ? kinds[0] : kinds } : {}),
    ...(parsed.tags.length > 0 ? { tag: parsed.tags } : {}),
    ...(parsed.favorite ? { favorite: true } : {}),
    ...(parsed.liked ? { liked: true } : {}),
    ...(parsed.folders.length > 0 ? { folder: parsed.folders } : {}),
    ...(collections.length > 0 ? { collection: collections } : {}),
    ...(parsed.sizes.length > 0
      ? { size: parsed.sizes.map(comparisonWireForm) }
      : {}),
    ...(parsed.durations.length > 0
      ? { duration: parsed.durations.map(comparisonWireForm) }
      : {}),
    ...(modified.length > 0 ? { modified } : {}),
  };
}

interface FileSearchInput {
  open: boolean;
  drive: string | null;
  query: string;
  scopeType: FileKind | null;
  browsing: boolean;
}

export interface FileSearch {
  merged: FileItemWithMatch[];
  total: number;
  loading: boolean;
  semanticPending: boolean;
  /** An `in:` resolution that failed or was too large; nothing is listed. */
  inNameError: "failed" | "tooLarge" | null;
  reset: () => void;
}

interface HeldResolution {
  key: string;
  collections: string[];
  fileIds: string[] | null;
}

/** The modal's two-stage file search: names first, then meaning. */
export function useFileSearch({ open, drive, query, scopeType, browsing }: FileSearchInput): FileSearch {
  const [merged, setMerged] = useState<FileItemWithMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [semanticPending, setSemanticPending] = useState(false);
  const [inNameError, setInNameError] = useState<"failed" | "tooLarge" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSearchRef = useRef<{ key: string; filtered: boolean } | null>(null);
  const resolutionRef = useRef<HeldResolution | null>(null);

  useEffect(() => {
    if (!open || !drive || browsing || !query.trim()) {
      setMerged([]);
      setTotal(0);
      setInNameError(null);
      resolutionRef.current = null;
      previousSearchRef.current = null;
      return;
    }

    const trimmed = query.trim();
    const parsed = parseSearchQuery(trimmed);
    // One `now` per search run: this effect starts a new run for each query,
    // so every stage and page below sees the same resolved wire forms.
    const now = Date.now();
    const modified = resolveModified(parsed, now);
    const kinds = resolveKinds(scopeType, parsed.types);
    if (kinds.impossible || hasImpossibleRange(parsed, modified.comparisons)) {
      setMerged([]);
      setTotal(0);
      setLoading(false);
      setInNameError(null);
      previousSearchRef.current = null;
      return;
    }
    const nameMatched = parsed.text !== "";
    const hasInNames = parsed.collections.length > 0;
    const listKey = hasInNames ? inNamesKey(drive, parsed) : "";
    setInNameError(null);
    if (!hasInNames) resolutionRef.current = null;
    const cacheKey: SearchCacheKey = {
      drive,
      query: trimmed,
      type: scopeType,
      includeSceneClip: false,
    };

    const cached = hasInNames ? null : readSearchCache(cacheKey);
    if (cached) {
      const m = mergeResults({
        filenameMatches: cached.filenameMatches,
        semanticHits: cached.semanticHits,
        filenameTotal: cached.filenameTotal,
        nameMatched,
      });
      const sorted = sortMerged(m.files, "relevance", "desc");
      setMerged(sorted.slice(0, POPUP_LIMIT));
      setTotal(m.total);
    }

    const previous = previousSearchRef.current;
    previousSearchRef.current = { key: trimmed, filtered: parsed.hasOperators };
    if (previous && previous.key !== trimmed && (previous.filtered || parsed.hasOperators)) {
      setMerged([]);
      setTotal(0);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ctrl = new AbortController();

    debounceRef.current = setTimeout(() => {
      setLoading(true);

      // `ctrl.signal.aborted` is the whole generation guard. The cleanup
      // below aborts synchronously when the query, the drive or `open`
      // changes, so a stage belonging to an older query cannot reach
      // `setMerged` however the two stages interleave.
      let filenameRes: Awaited<ReturnType<typeof getDriveFiles>> | null = null;
      let semanticHits: SemanticHit[] = [];
      let resolved: HeldResolution | null = null;

      const paint = () => {
        // If semantic search is the faster of the two, its hits wait here
        // rather than rendering a list with no name matches in it.
        if (ctrl.signal.aborted || !filenameRes) return;
        const m = mergeResults({
          filenameMatches: filenameRes.data,
          semanticHits,
          filenameTotal: filenameRes.meta.total,
          nameMatched,
        });
        const sorted = sortMerged(m.files, "relevance", "desc");
        setMerged(sorted.slice(0, POPUP_LIMIT));
        setTotal(m.total);
      };

      const onStageFailure = () => {
        // Stale-while-revalidate: keep the cached snapshot rendered
        // when revalidation fails on a transient network blip. Only
        // wipe state when there was nothing cached to fall back on.
        if (!ctrl.signal.aborted && !cached && !filenameRes) {
          setMerged([]);
          setTotal(0);
        }
      };

      const run = async () => {
        if (hasInNames) {
          const held = resolutionRef.current;
          resolved = held && held.key === listKey ? held : null;
          if (!resolved) {
            const io: InNameIo = {
              getCollections,
              getSmartFolders,
              getDriveFiles,
              getSemanticAvailability,
              fetchSemanticHits,
            };
            let outcome;
            try {
              outcome = await resolveInNames(drive, parsed, ctrl.signal, io, now);
            } catch {
              if (ctrl.signal.aborted) return;
              outcome = { status: "failed" as const };
            }
            if (ctrl.signal.aborted) return;
            if (outcome.status !== "resolved") {
              if (outcome.status !== "refused") setInNameError(outcome.status);
              setMerged([]);
              setTotal(0);
              setLoading(false);
              setSemanticPending(false);
              return;
            }
            resolved = {
              key: listKey,
              collections: outcome.collections,
              fileIds: outcome.fileIds,
            };
            resolutionRef.current = resolved;
          }
        }
        setInNameError(null);

        const collections = resolved?.collections ?? parsed.collections;
        const fileIds = resolved?.fileIds ?? null;

        const filenameP = (fileIds !== null
          ? getDriveFilesWithFileIds(
              drive,
              listingParams(parsed, kinds.kinds, collections, modified.wireForms),
              fileIds,
              { signal: ctrl.signal },
            )
          : getDriveFiles(
              drive,
              listingParams(parsed, kinds.kinds, collections, modified.wireForms),
              { signal: ctrl.signal },
            ))
          .then((res) => {
            filenameRes = res;
            paint();
          })
          .catch(onStageFailure)
          .finally(() => {
            if (!ctrl.signal.aborted) setLoading(false);
          });

        // A scope's own page does not read operators, so a scoped search keeps
        // its name-only behaviour here.
        const filter: SearchFilter | null = parsed.hasOperators
          ? {
              ...filterFromParsed(parsed, scopeType, modified.wireForms),
              collections: [...collections],
            }
          : null;
        const semanticEligible = !scopeType && parsed.text !== "";
        let semanticOk = true;

        const semanticP = (semanticEligible
          ? isSemanticSearchAvailable(drive)
          : Promise.resolve(false))
          .then((available) => {
            if (!available || ctrl.signal.aborted) {
              return { ok: true, results: [] as SemanticHit[] };
            }
            setSemanticPending(true);
            return fetchSemanticHits(parsed.text, drive, {
              limit: POPUP_LIMIT,
              ...(filter ? { filter } : {}),
              ...(fileIds !== null ? { fileIds } : {}),
              signal: ctrl.signal,
            });
          })
          .then((answer) => {
            if (ctrl.signal.aborted) return;
            semanticHits = answer.results;
            semanticOk = answer.ok;
            paint();
          })
          .catch(() => {
            semanticOk = false;
            onStageFailure();
          })
          .finally(() => {
            if (!ctrl.signal.aborted) setSemanticPending(false);
          });

        void Promise.all([filenameP, semanticP]).then(() => {
          if (ctrl.signal.aborted || !filenameRes || !semanticOk) return;
          if (hasInNames) return;
          writeSearchCache(cacheKey, {
            filenameMatches: filenameRes.data,
            filenameTotal: filenameRes.meta.total,
            semanticHits,
          });
        });
      };

      void run();
    }, 300);

    return () => {
      ctrl.abort();
      setSemanticPending(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, drive, scopeType, browsing]);

  const reset = useCallback(() => {
    setMerged([]);
    setTotal(0);
  }, []);

  return { merged, total, loading, semanticPending, inNameError, reset };
}
