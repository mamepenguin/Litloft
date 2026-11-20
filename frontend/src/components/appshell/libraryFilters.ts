"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { AppId } from "@/lib/appPrefs";

/** One app's Library filters while its page stays open. */
export interface LibraryFilterState {
  drive: string;
  tags: readonly string[];
  /** `all`, or one of the app's state values. */
  state: string;
}

const EMPTY_TAGS: readonly string[] = [];

/** The Target's tag conditions first, then the chosen ones, compared folded. */
export function mergeLibraryTags(
  base: readonly string[],
  added: readonly string[],
): string[] {
  const merged = [...base];
  for (const tag of added) {
    if (!merged.some((held) => held.toLowerCase() === tag.toLowerCase())) merged.push(tag);
  }
  return merged;
}

interface Entry {
  snapshot: LibraryFilterState;
}

const entries = new Map<AppId, Entry>();
const listeners = new Set<() => void>();

function emptyFor(drive: string): LibraryFilterState {
  return { drive, tags: EMPTY_TAGS, state: "all" };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Reading a drive the entry does not belong to replaces it, so A→B→A starts
 * empty rather than bringing A's filters back.
 */
function entryFor(app: AppId, drive: string): Entry {
  const held = entries.get(app);
  if (held !== undefined && held.snapshot.drive === drive) return held;
  const entry: Entry = { snapshot: emptyFor(drive) };
  entries.set(app, entry);
  return entry;
}

export function readLibraryFilters(app: AppId, drive: string): LibraryFilterState {
  return entryFor(app, drive).snapshot;
}

export function writeLibraryFilters(
  app: AppId,
  drive: string,
  change: Partial<Pick<LibraryFilterState, "tags" | "state">>,
): void {
  const entry = entryFor(app, drive);
  const next: LibraryFilterState = {
    ...entry.snapshot,
    ...(change.tags !== undefined ? { tags: [...change.tags] } : {}),
    ...(change.state !== undefined ? { state: change.state } : {}),
  };
  entries.set(app, { snapshot: next });
  notify();
}

export function resetLibraryFilters(app: AppId, drive: string): void {
  entries.set(app, { snapshot: emptyFor(drive) });
  notify();
}

export function subscribeLibraryFilters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The app's Library filters, shared by every mount of its Library while the
 * page stays open. Clearing the profile clears the state, which reads the
 * viewer's rows.
 */
export function useLibraryFilters(
  app: AppId,
  drive: string,
  hasProfile: boolean,
): {
  tags: readonly string[];
  state: string;
  toggleTag: (name: string) => void;
  clearTags: () => void;
  setState: (state: string) => void;
} {
  const filters = useSyncExternalStore(
    subscribeLibraryFilters,
    () => readLibraryFilters(app, drive),
    () => readLibraryFilters(app, drive),
  );

  const toggleTag = useCallback(
    (name: string) => {
      const held = readLibraryFilters(app, drive);
      const chosen = held.tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
      writeLibraryFilters(app, drive, {
        tags: chosen
          ? held.tags.filter((tag) => tag.toLowerCase() !== name.toLowerCase())
          : [...held.tags, name],
      });
    },
    [app, drive],
  );

  const clearTags = useCallback(() => {
    writeLibraryFilters(app, drive, { tags: EMPTY_TAGS });
  }, [app, drive]);

  const setState = useCallback(
    (state: string) => {
      writeLibraryFilters(app, drive, { state });
    },
    [app, drive],
  );

  useEffect(() => {
    if (!hasProfile && readLibraryFilters(app, drive).state !== "all") {
      writeLibraryFilters(app, drive, { state: "all" });
    }
  }, [app, drive, hasProfile]);

  return { tags: filters.tags, state: filters.state, toggleTag, clearTags, setState };
}
