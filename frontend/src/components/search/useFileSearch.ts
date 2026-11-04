"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getDriveFiles } from "@/lib/api";
import { fetchSemanticHits, isSemanticSearchAvailable } from "@/lib/semanticSearch";
import { mergeResults, sortMerged, type SemanticHit } from "@/lib/searchMerge";
import { readSearchCache, writeSearchCache, type SearchCacheKey } from "@/lib/searchCache";
import {
  filterFromParsed,
  parseSearchQuery,
  resolveKinds,
  type ParsedQuery,
  type SearchFilter,
} from "@/lib/searchQuery";
import type { FileItemWithMatch, FileKind } from "@/types";

const POPUP_LIMIT = 8;

/** The listing call for a parsed query; a query without operators sends what it always did. */
function listingParams(parsed: ParsedQuery, kinds: FileKind[]) {
  return {
    search: parsed.text,
    limit: POPUP_LIMIT,
    ...(kinds.length > 0 ? { type: kinds.length === 1 ? kinds[0] : kinds } : {}),
    ...(parsed.tags.length > 0 ? { tag: parsed.tags } : {}),
    ...(parsed.favorite ? { favorite: true } : {}),
    ...(parsed.liked ? { liked: true } : {}),
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
  reset: () => void;
}

/** The modal's two-stage file search: names first, then meaning. */
export function useFileSearch({ open, drive, query, scopeType, browsing }: FileSearchInput): FileSearch {
  const [merged, setMerged] = useState<FileItemWithMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [semanticPending, setSemanticPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSearchRef = useRef<{ key: string; filtered: boolean } | null>(null);

  useEffect(() => {
    if (!open || !drive || browsing || !query.trim()) {
      setMerged([]);
      setTotal(0);
      previousSearchRef.current = null;
      return;
    }

    const trimmed = query.trim();
    const parsed = parseSearchQuery(trimmed);
    const kinds = resolveKinds(scopeType, parsed.types);
    if (kinds.impossible) {
      setMerged([]);
      setTotal(0);
      setLoading(false);
      previousSearchRef.current = null;
      return;
    }
    const nameMatched = parsed.text !== "";
    const cacheKey: SearchCacheKey = {
      drive,
      query: trimmed,
      type: scopeType,
      includeSceneClip: false,
    };

    const cached = readSearchCache(cacheKey);
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

      const filenameP = getDriveFiles(
        drive,
        listingParams(parsed, kinds.kinds),
        { signal: ctrl.signal },
      )
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
        ? filterFromParsed(parsed, scopeType)
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
        writeSearchCache(cacheKey, {
          filenameMatches: filenameRes.data,
          filenameTotal: filenameRes.meta.total,
          semanticHits,
        });
      });
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

  return { merged, total, loading, semanticPending, reset };
}
