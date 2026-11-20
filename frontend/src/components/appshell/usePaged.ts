"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Page<T> {
  items: T[];
  /** The whole size, not this page's. */
  total: number;
}

export type PagedPhase = "idle" | "loading" | "ready" | "failed";

/** A page's own item identity: a file id or a grouped shelf's key. */
function identityOf(item: unknown): string {
  if (item !== null && typeof item === "object") {
    const record = item as { id?: unknown; key?: unknown };
    if (typeof record.id === "string") return `id:${record.id}`;
    if (typeof record.key === "string") return `key:${record.key}`;
  }
  return `json:${JSON.stringify(item)}`;
}

function withoutRepeats<T>(items: readonly T[], held: ReadonlySet<string>): T[] {
  const seen = new Set(held);
  const out: T[] = [];
  for (const item of items) {
    const key = identityOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

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
export function usePaged<T>(
  fetchPage: ((page: number) => Promise<Page<T>>) | null,
  revision = 0,
) {
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<Paged<T> | null>(null);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  useEffect(() => {
    if (fetchPage === null) return;
    let current = true;
    fetchPage(1).then(
      (page) => {
        if (current) {
          const items = withoutRepeats(page.items, new Set());
          setHeld({
            fetchPage,
            attempt,
            items,
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
    const atRevision = revisionRef.current;
    setHeld({ ...requested, more: "loading" });
    fetchPage(requested.pages + 1).then(
      (page) =>
        setHeld((now) => {
          if (!stillHeld(now)) return now;
          // A removal while this page was in flight changed the server's
          // boundaries; ask again from the offset the held list now ends at.
          if (revisionRef.current !== atRevision) return { ...now, more: "idle" };
          // A renamed or moved file can shift the server's page boundary; an
          // id the list already holds is not drawn twice.
          const held = new Set(now.items.map(identityOf));
          const added = withoutRepeats(page.items, held);
          return {
            ...now,
            items: [...now.items, ...added],
            // A page with nothing in it ends the list, whatever the total says.
            total: page.items.length === 0 ? now.items.length : page.total,
            pages: now.pages + 1,
            more: "idle",
          };
        }),
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
