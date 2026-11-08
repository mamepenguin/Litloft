"use client";

import { useCallback, useEffect, useState } from "react";

export interface Page<T> {
  items: T[];
  /** The whole size, not this page's. */
  total: number;
}

export type PagedPhase = "idle" | "loading" | "ready" | "failed";

interface Paged<T> {
  fetchPage: (page: number) => Promise<Page<T>>;
  attempt: number;
  items: T[];
  total: number;
  pages: number;
  phase: "ready" | "failed";
  more: "idle" | "loading" | "failed";
}

/**
 * Pages of one list, bound to the `fetchPage` that fetched them: a new
 * `fetchPage` starts over and drops anything still in flight for the old one.
 * `null` is "nothing to ask".
 */
export function usePaged<T>(fetchPage: ((page: number) => Promise<Page<T>>) | null) {
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<Paged<T> | null>(null);

  useEffect(() => {
    if (fetchPage === null) return;
    let current = true;
    fetchPage(1).then(
      (page) => {
        if (current) {
          setHeld({
            fetchPage,
            attempt,
            items: page.items,
            total: page.total,
            pages: 1,
            phase: "ready",
            more: "idle",
          });
        }
      },
      () => {
        if (current) {
          setHeld({ fetchPage, attempt, items: [], total: 0, pages: 0, phase: "failed", more: "idle" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [fetchPage, attempt]);

  const own = held && held.fetchPage === fetchPage && held.attempt === attempt ? held : null;

  const loadMore = useCallback(() => {
    if (!own || !fetchPage || own.phase !== "ready" || own.more === "loading") return;
    if (own.items.length >= own.total) return;
    const requested = own;
    const stillHeld = (now: Paged<T> | null): now is Paged<T> =>
      now !== null && now.fetchPage === requested.fetchPage && now.attempt === requested.attempt;
    setHeld({ ...requested, more: "loading" });
    fetchPage(requested.pages + 1).then(
      (page) =>
        setHeld((now) =>
          stillHeld(now)
            ? {
                ...now,
                items: [...now.items, ...page.items],
                // A page with nothing in it ends the list, whatever the total says.
                total: page.items.length === 0 ? now.items.length : page.total,
                pages: now.pages + 1,
                more: "idle",
              }
            : now,
        ),
      () => setHeld((now) => (stillHeld(now) ? { ...now, more: "failed" } : now)),
    );
  }, [own, fetchPage]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const phase: PagedPhase = fetchPage === null ? "idle" : own === null ? "loading" : own.phase;
  return {
    phase,
    items: own?.items ?? [],
    total: own?.total ?? 0,
    more: own?.more ?? "idle",
    hasMore: own !== null && own.items.length < own.total,
    loadMore,
    retry,
  };
}
