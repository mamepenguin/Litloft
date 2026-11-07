"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { useProfile } from "@/components/ProfileProvider";
import { ApiStatusError, createHighlight, deleteHighlight, listHighlights } from "./api";
import type { Highlight, HighlightInput } from "@/types";

export const HighlightFileContext = createContext<string | null>(null);

export const HIGHLIGHTS_PER_FILE = 500;
export const MAX_HIGHLIGHT_CHARACTERS = 2000;

const LOCAL_ID_PREFIX = "local-";

export type SaveHighlightOutcome =
  | "saved"
  | "duplicate"
  | "limit"
  | "failed"
  | "discarded";

export type RemoveHighlightOutcome = "removed" | "failed" | "discarded";

const EMPTY_RECORDS: readonly Highlight[] = [];
const NOOP_SUBSCRIBE = () => () => undefined;
const emptySnapshot = () => EMPTY_RECORDS;

function storageKey(fileId: string): string {
  return `highlights:${fileId}`;
}

function localId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${LOCAL_ID_PREFIX}${random}`;
}

function sameAnchor(
  record: Highlight,
  input: HighlightInput,
): boolean {
  return (
    record.quote === input.quote &&
    record.prefix === input.prefix &&
    record.suffix === input.suffix &&
    record.page === (input.page ?? null)
  );
}

function isHighlight(value: unknown): value is Highlight {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    (record.page === null || typeof record.page === "number") &&
    typeof record.quote === "string" &&
    typeof record.prefix === "string" &&
    typeof record.suffix === "string" &&
    typeof record.created_at === "string"
  );
}

function readLocal(fileId: string): Highlight[] | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isHighlight);
  } catch {
    return null;
  }
}

function writeLocal(fileId: string, records: Highlight[]): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(storageKey(fileId), JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

class HighlightStore {
  private readonly fileId: string;
  private records: readonly Highlight[] = EMPTY_RECORDS;
  private listeners = new Set<() => void>();
  private subscribers = 0;
  /** Null until the hook says which store the current profile selects. */
  private hasProfile: boolean | null = null;
  /** Bumped whenever the selected store changes; older results are dropped. */
  private generation = 0;
  private loading = false;
  private loaded = false;

  constructor(fileId: string) {
    this.fileId = fileId;
  }

  getSnapshot = (): readonly Highlight[] => this.records;

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers += 1;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.subscribers -= 1;
      if (this.subscribers === 0) this.reset();
    };
  };

  setProfile(hasProfile: boolean): void {
    if (this.hasProfile === hasProfile) {
      if (!this.loaded && !this.loading) this.startLoad();
      return;
    }
    this.hasProfile = hasProfile;
    this.generation += 1;
    this.loading = false;
    this.loaded = false;
    this.commit(EMPTY_RECORDS);
    this.startLoad();
  }

  async save(input: HighlightInput): Promise<SaveHighlightOutcome> {
    const hasProfile = this.hasProfile;
    if (hasProfile === null) return "failed";
    const generation = this.generation;

    if (!hasProfile) {
      const rows = readLocal(this.fileId) ?? [];
      const duplicate = rows.find((record) => sameAnchor(record, input));
      if (duplicate) {
        if (generation === this.generation) this.commit(rows);
        return "duplicate";
      }
      if (rows.length >= HIGHLIGHTS_PER_FILE) return "limit";

      const record: Highlight = {
        id: localId(),
        page: input.page ?? null,
        quote: input.quote,
        prefix: input.prefix,
        suffix: input.suffix,
        created_at: new Date().toISOString(),
      };
      const next = [...rows, record];
      if (!writeLocal(this.fileId, next)) return "failed";
      if (generation !== this.generation) return "discarded";
      this.commit(next);
      return "saved";
    }

    try {
      const record = await createHighlight(this.fileId, input);
      if (generation !== this.generation) return "discarded";
      this.commit(upsert(this.records, record));
      return "saved";
    } catch (error) {
      if (generation !== this.generation) return "discarded";
      return error instanceof ApiStatusError && error.status === 409
        ? "limit"
        : "failed";
    }
  }

  async remove(highlightId: string): Promise<RemoveHighlightOutcome> {
    const hasProfile = this.hasProfile;
    if (hasProfile === null) return "failed";
    const generation = this.generation;

    if (!hasProfile) {
      const rows = readLocal(this.fileId);
      if (rows === null) return "failed";
      const next = rows.filter((record) => record.id !== highlightId);
      if (!writeLocal(this.fileId, next)) return "failed";
      if (generation !== this.generation) return "discarded";
      this.commit(next);
      return "removed";
    }

    try {
      await deleteHighlight(this.fileId, highlightId);
    } catch {
      return generation === this.generation ? "failed" : "discarded";
    }
    if (generation !== this.generation) return "discarded";
    this.commit(
      this.records.filter((record) => record.id !== highlightId),
    );
    return "removed";
  }

  private startLoad(): void {
    if (this.loading || this.loaded || this.hasProfile === null) return;
    const generation = this.generation;

    if (!this.hasProfile) {
      const rows = readLocal(this.fileId);
      this.loading = false;
      this.loaded = true;
      if (generation !== this.generation) return;
      this.commit(rows ?? EMPTY_RECORDS);
      return;
    }

    this.loading = true;
    listHighlights(this.fileId)
      .then((rows) => {
        if (generation !== this.generation) return;
        this.loading = false;
        this.loaded = true;
        this.commit(rows);
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.loading = false;
      });
  }

  private commit(records: readonly Highlight[]): void {
    this.records = records;
    for (const listener of this.listeners) listener();
  }

  private reset(): void {
    this.hasProfile = null;
    this.generation += 1;
    this.loading = false;
    this.loaded = false;
    this.records = EMPTY_RECORDS;
  }
}

function upsert(
  records: readonly Highlight[],
  record: Highlight,
): readonly Highlight[] {
  const at = records.findIndex((candidate) => candidate.id === record.id);
  if (at < 0) return [...records, record];
  const next = [...records];
  next[at] = record;
  return next;
}

const stores = new Map<string, HighlightStore>();

function storeFor(fileId: string): HighlightStore {
  let store = stores.get(fileId);
  if (!store) {
    store = new HighlightStore(fileId);
    stores.set(fileId, store);
  }
  return store;
}

export interface HighlightStoreHandle {
  store: HighlightStore | null;
  records: readonly Highlight[];
}

export function useHighlightStore(fileId: string | null): HighlightStoreHandle {
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const store = useMemo(
    () => (fileId === null ? null : storeFor(fileId)),
    [fileId],
  );

  useEffect(() => {
    store?.setProfile(hasProfile);
  }, [store, hasProfile]);

  const records = useSyncExternalStore(
    store?.subscribe ?? NOOP_SUBSCRIBE,
    store?.getSnapshot ?? emptySnapshot,
    store?.getSnapshot ?? emptySnapshot,
  );

  return { store, records };
}
