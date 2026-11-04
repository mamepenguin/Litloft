"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import { getInbox, type InboxItem } from "@/lib/api";

const PAGE_SIZE = 100;

function withoutHidden(
  items: readonly InboxItem[],
  hidden: ReadonlySet<string>,
): InboxItem[] {
  if (hidden.size === 0) return [...items];
  return items.filter((item) => !hidden.has(item.file.id));
}

/**
 * The drive's open arrivals, with rows hidden by a done request still in
 * flight kept out of every reload until that request answers.
 */
export function useInboxData(drive: string, onError: () => void) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openCount, setOpenCount] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const nextRef = useRef(next);
  nextRef.current = next;
  const requestRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadFirstPage = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const answer = await getInbox(drive, { limit: PAGE_SIZE });
      if (requestRef.current !== request) return;
      setItems(answer.items);
      setNext(answer.next);
      setOpenCount(answer.open_count);
    } catch {
      if (requestRef.current === request) onErrorRef.current();
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [drive]);

  useEffect(() => {
    setItems([]);
    setHidden(new Set());
    setOpenCount(0);
    setNext(null);
    setLoading(true);
    void loadFirstPage();
  }, [loadFirstPage]);

  const reload = useCallback(
    async (extra = 0) => {
      const request = ++requestRef.current;
      const target = Math.max(itemsRef.current.length + extra, 1);
      const collected: InboxItem[] = [];
      let cursor: string | null = null;
      let count = openCount;
      try {
        while (collected.length < target) {
          const answer = await getInbox(drive, {
            before: cursor,
            limit: PAGE_SIZE,
          });
          if (requestRef.current !== request) return;
          collected.push(...answer.items);
          count = answer.open_count;
          cursor = answer.next;
          if (!cursor || answer.items.length === 0) break;
        }
      } catch {
        if (requestRef.current === request) onErrorRef.current();
        return;
      }
      if (requestRef.current !== request) return;
      setItems(collected);
      setNext(cursor);
      setOpenCount(count);
      setLoading(false);
    },
    [drive, openCount],
  );

  const loadMore = useCallback(async () => {
    const cursor = nextRef.current;
    if (!cursor || loadingMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const answer = await getInbox(drive, {
        before: cursor,
        limit: PAGE_SIZE,
      });
      if (requestRef.current !== request) return;
      setItems((previous) => [...previous, ...answer.items]);
      setNext(answer.next);
      setOpenCount(answer.open_count);
    } catch {
      onErrorRef.current();
    } finally {
      if (requestRef.current === request) setLoadingMore(false);
    }
  }, [drive, loadingMore]);

  useEffect(() => {
    if (!next || loadingMore) return;
    if (typeof IntersectionObserver === "undefined") return;
    const element = sentinelRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [next, loadingMore, loadMore]);

  useWebSocketRefresh(
    ["inbox.updated", "drive.structure_changed"],
    () => {
      void reload();
    },
    drive,
  );

  const hide = useCallback((ids: readonly string[]) => {
    setHidden((previous) => {
      const nextHidden = new Set(previous);
      for (const id of ids) nextHidden.add(id);
      return nextHidden;
    });
  }, []);

  const restoreHidden = useCallback((ids: readonly string[]) => {
    setHidden((previous) => {
      const nextHidden = new Set(previous);
      for (const id of ids) nextHidden.delete(id);
      return nextHidden;
    });
  }, []);

  const settle = useCallback((ids: readonly string[], closed: number) => {
    const removed = new Set(ids);
    setItems((previous) => previous.filter((item) => !removed.has(item.file.id)));
    setHidden((previous) => {
      const nextHidden = new Set(previous);
      for (const id of ids) nextHidden.delete(id);
      return nextHidden;
    });
    setOpenCount((previous) => Math.max(previous - closed, 0));
  }, []);

  return {
    items,
    visibleItems: withoutHidden(items, hidden),
    openCount,
    loading,
    loadingMore,
    sentinelRef,
    reload,
    hide,
    restoreHidden,
    settle,
  };
}
