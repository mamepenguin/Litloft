"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { ShelfItem } from "@/lib/api";

interface Operation {
  kind: "remove" | "restore";
  id: string;
}

interface Departed {
  item: ShelfItem;
  index: number;
}

// Discover's shelves unmount when the viewer switches to the Library tab, and
// the visit they belong to does not end there; operations recorded under a
// visit key outlive the component for the rest of the JS session, as the
// stored ids under the same key do. An undo can arrive through the callbacks of
// a shelf that has since unmounted, so the mounted one subscribes.
const operationsByKey = new Map<string, Operation[]>();
const listenersByKey = new Map<string, Set<() => void>>();
const NO_OPERATIONS: Operation[] = [];

function subscribeKey(key: string, listener: () => void): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateKey(key: string, update: (prev: Operation[]) => Operation[]): void {
  operationsByKey.set(key, update(operationsByKey.get(key) ?? NO_OPERATIONS));
  for (const listener of listenersByKey.get(key) ?? []) listener();
}

/**
 * A provider list with item actions taken out and put back. The operations are
 * replayed over the list the provider supplies now, so a page that appends
 * still shows its new items and an id that left the provider's list cannot be
 * put back. A removal records the index it left at; an undo inserts it there,
 * clamped to the list's current length.
 */
export function useRemovableItems(supplied: readonly ShelfItem[], key?: string) {
  const [localOperations, setLocalOperations] = useState<Operation[]>(NO_OPERATIONS);
  const subscribe = useCallback(
    (listener: () => void) => (key === undefined ? () => {} : subscribeKey(key, listener)),
    [key],
  );
  const keyedOperations = useSyncExternalStore(
    subscribe,
    () => (key === undefined ? NO_OPERATIONS : (operationsByKey.get(key) ?? NO_OPERATIONS)),
    () => NO_OPERATIONS,
  );
  const operations = key === undefined ? localOperations : keyedOperations;
  const setOperations = useCallback(
    (update: (prev: Operation[]) => Operation[]) => {
      if (key === undefined) setLocalOperations(update);
      else updateKey(key, update);
    },
    [key],
  );

  // Replayed per render rather than memoized: a paging hook appends into the
  // same array, so its identity does not move when the list grows.
  const suppliedIds = new Set(supplied.map((item) => item.id));
  const list = supplied.slice();
  const departed = new Map<string, Departed>();
  for (const operation of operations) {
    if (!suppliedIds.has(operation.id)) continue;
    if (operation.kind === "remove") {
      const index = list.findIndex((item) => item.id === operation.id);
      if (index < 0) continue;
      if (!departed.has(operation.id)) {
        departed.set(operation.id, { item: list[index], index });
      }
      list.splice(index, 1);
    } else {
      const entry = departed.get(operation.id);
      if (!entry) continue;
      departed.delete(operation.id);
      const index = Math.min(entry.index, list.length);
      list.splice(index, 0, entry.item);
    }
  }

  const remove = useCallback(
    (id: string) => setOperations((prev) => [...prev, { kind: "remove", id }]),
    [setOperations],
  );

  const restore = useCallback(
    (id: string) => setOperations((prev) => [...prev, { kind: "restore", id }]),
    [setOperations],
  );

  return { items: list, remove, restore };
}

