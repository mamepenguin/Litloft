"use client";

import { useCallback, useEffect, useState } from "react";

import type { Shelf, ShelvesResponse } from "@/lib/api";
import { chipsFromShelves, type FolderChip } from "./folders";

export const CHIP_PAGE_SIZE = 24;
export const CHIP_LIMIT = 120;

type LoadPage = (offset: number) => Promise<ShelvesResponse>;

interface Held {
  input: LoadPage;
  base: string;
  shelves: Shelf[];
  loading: boolean;
  error: boolean;
  done: boolean;
}

export type FolderChipsState =
  | { status: "idle"; chips: FolderChip[]; base: string; error: boolean }
  | { status: "loading"; chips: FolderChip[]; base: string; error: boolean }
  | { status: "ready"; chips: FolderChip[]; base: string; error: boolean }
  | { status: "failed"; chips: FolderChip[]; base: string; error: boolean };

/**
 * The child folders of the folder classification's base, fetched a page of
 * 24 at a time up to 120. A page that fails leaves the chips already drawn
 * in place; `retry` asks for them again from the first page.
 */
export function useFolderChips(loadPage: LoadPage | null): {
  state: FolderChipsState;
  retry: () => void;
} {
  const [held, setHeld] = useState<Held | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loadPage === null) {
      setHeld(null);
      return;
    }
    let current = true;
    let offset = 0;
    let base = "";
    const shelves: Shelf[] = [];

    setHeld((previous) =>
      previous && previous.input === loadPage
        ? { ...previous, loading: true, error: false }
        : { input: loadPage, base: "", shelves: [], loading: true, error: false, done: false },
    );

    const publish = (finished: boolean, failed: boolean) => {
      setHeld({
        input: loadPage,
        base,
        shelves: [...shelves],
        loading: !finished && !failed,
        error: failed,
        done: finished,
      });
    };

    const run = async () => {
      while (current) {
        let response: ShelvesResponse;
        try {
          response = await loadPage(offset);
        } catch {
          if (current) publish(false, true);
          return;
        }
        if (!current) return;

        if (offset === 0) base = response.base;
        shelves.push(...response.shelves);
        const chips = chipsFromShelves(shelves, base, CHIP_LIMIT);
        const exhausted =
          response.shelves.length === 0 || offset + CHIP_PAGE_SIZE >= response.total_shelves;
        const full = chips.length >= CHIP_LIMIT;
        publish(exhausted || full, false);
        if (exhausted || full) return;
        offset += CHIP_PAGE_SIZE;
      }
    };

    void run();
    return () => {
      current = false;
    };
  }, [loadPage, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const chips = held === null ? [] : chipsFromShelves(held.shelves, held.base, CHIP_LIMIT);
  const status: FolderChipsState["status"] =
    held === null
      ? "idle"
      : held.loading && held.shelves.length === 0
        ? "loading"
        : held.error && held.shelves.length === 0
          ? "failed"
          : "ready";

  return {
    state: { status, chips, base: held?.base ?? "", error: held?.error ?? false },
    retry,
  };
}
