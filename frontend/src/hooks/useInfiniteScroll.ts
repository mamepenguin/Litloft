"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

interface FetchResult<T> {
  data: T[];
  total: number;
}

interface UseInfiniteScrollOptions<T> {
  fetchPage: (page: number, limit: number) => Promise<FetchResult<T>>;
  limit?: number;
  disabled?: boolean;
}

interface UseInfiniteScrollReturn<T> {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  reset: () => void;
  setItems: Dispatch<SetStateAction<T[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
}

export function useInfiniteScroll<T>({
  fetchPage,
  limit = 30,
  disabled = false,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const pageRef = useRef(1);
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
    setItems([]);
    setTotal(0);
    setLoading(true);
    setLoadingMore(false);
    setEpoch((e) => e + 1);
  }, []);

  // Initial load and reset trigger
  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    loadPage(1, false);
  }, [loadPage, disabled, epoch]);

  // IntersectionObserver for sentinel
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

  return { items, total, loading, loadingMore, hasMore, sentinelRef, reset, setItems, setTotal };
}
