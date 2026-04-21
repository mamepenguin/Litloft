"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

interface FetchResult<T> {
  data: T[];
  total: number;
}

interface InitialHydration<T> {
  items: T[];
  total: number;
  page: number;
}

interface UseInfiniteScrollOptions<T> {
  fetchPage: (page: number, limit: number) => Promise<FetchResult<T>>;
  limit?: number;
  disabled?: boolean;
  initial?: InitialHydration<T> | null;
}

interface UseInfiniteScrollReturn<T> {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pagesLoaded: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
  reset: () => void;
  setItems: Dispatch<SetStateAction<T[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
}

export function useInfiniteScroll<T>({
  fetchPage,
  limit = 30,
  disabled = false,
  initial = null,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const [items, setItems] = useState<T[]>(() => initial?.items ?? []);
  const [total, setTotal] = useState(() => initial?.total ?? 0);
  const [loading, setLoading] = useState(() => initial == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(() => initial?.page ?? 0);
  const [epoch, setEpoch] = useState(0);
  const pageRef = useRef(initial?.page ?? 1);
  const hydratedRef = useRef(initial != null);
  const fetchIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = items.length < total;

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const id = ++fetchIdRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await fetchPage(pageNum, limit);
        if (fetchIdRef.current !== id) return;
        if (append) {
          setItems((prev) => [...prev, ...result.data]);
        } else {
          setItems(result.data);
        }
        setTotal(result.total);
        pageRef.current = pageNum;
        setPagesLoaded(pageNum);
      } catch {
        if (fetchIdRef.current !== id) return;
        if (!append) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (fetchIdRef.current === id) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetchPage, limit],
  );

  const reset = useCallback(() => {
    fetchIdRef.current++;
    pageRef.current = 1;
    hydratedRef.current = false;
    setItems([]);
    setTotal(0);
    setPagesLoaded(0);
    setLoading(true);
    setLoadingMore(false);
    setEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    if (hydratedRef.current && epoch === 0) {
      // First render after hydration from a snapshot — skip the initial fetch
      // so we don't clobber the restored items. Subsequent reset() calls set
      // hydratedRef=false and bump epoch, which re-enables fetching.
      return;
    }
    loadPage(1, false);
  }, [loadPage, disabled, epoch]);

  useEffect(() => {
    if (disabled || !hasMore || loadingMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadPage(pageRef.current + 1, true);
        }
      },
      { rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [disabled, hasMore, loadingMore, loading, loadPage]);

  return { items, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef, reset, setItems, setTotal };
}
