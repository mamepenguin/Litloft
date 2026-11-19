"use client";

import { useCallback, useState } from "react";

import type { ShelfItem } from "@/lib/api";

interface Operation {
  kind: "remove" | "restore";
  id: string;
}

interface Departed {
  item: ShelfItem;
  index: number;
}

/**
 * A provider list with item actions taken out and put back. The operations are
 * replayed over the list the provider supplies now, so a page that appends
 * still shows its new items and an id that left the provider's list cannot be
 * put back. A removal records the index it left at; an undo inserts it there,
 * clamped to the list's current length.
 */
// Discover's shelves unmount when the viewer switches to the Library tab, and
// the visit they belong to does not end there; operations recorded under a
// visit key outlive the component for the rest of the JS session, as the
// stored ids under the same key do.
const operationsByKey = new Map<string, Operation[]>();

export function useRemovableItems(supplied: readonly ShelfItem[], key?: string) {
  const [operations, setLocalOperations] = useState<Operation[]>(() =>
    key === undefined ? [] : (operationsByKey.get(key) ?? []),
  );
  const setOperations = useCallback(
    (update: (prev: Operation[]) => Operation[]) => {
      setLocalOperations((prev) => {
        const next = update(prev);
        if (key !== undefined) operationsByKey.set(key, next);
        return next;
      });
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

