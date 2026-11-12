"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "workbench-panels";
const MAX_PANELS = 2;

const EMPTY: readonly string[] = Object.freeze([]);

type Listener = () => void;

const listeners = new Set<Listener>();

let memoryOverride: string | null | undefined;
let lastRaw: string | null | undefined;
let snapshot: readonly string[] = EMPTY;

function parse(raw: string | null): readonly string[] {
  if (raw === null) return EMPTY;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    return EMPTY;
  }
  return value as string[];
}

function readRaw(): string | null {
  if (memoryOverride !== undefined) return memoryOverride;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function read(): readonly string[] {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    snapshot = parse(raw);
  }
  return snapshot;
}

function write(next: readonly string[]): void {
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    memoryOverride = undefined;
  } catch {
    memoryOverride = raw;
  }
  lastRaw = raw;
  snapshot = next;
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  memoryOverride = undefined;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

export function useWorkbenchPanels(): readonly string[] {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

/**
 * Appends `id`, dropping one id when the list would hold three. "Shown on
 * this file" is what decides which: an id the file cannot show is the first
 * thing to go, because no panel of the reader's is lost by dropping it.
 */
function append(
  current: readonly string[],
  id: string,
  available: ReadonlySet<string>,
): readonly string[] {
  const appended = [...current, id];
  if (appended.length <= MAX_PANELS) return appended;
  const shown = new Set(available);
  shown.add(id);
  const drop = appended.findIndex((entry) => !shown.has(entry));
  return appended.filter((_, index) => index !== (drop === -1 ? 0 : drop));
}

export function toggleWorkbenchPanel(
  id: string,
  available: ReadonlySet<string>,
): void {
  const current = read();
  if (current.includes(id)) {
    write(current.filter((entry) => entry !== id));
    return;
  }
  write(append(current, id, available));
}

export function closeWorkbenchPanel(id: string): void {
  const current = read();
  if (!current.includes(id)) return;
  write(current.filter((entry) => entry !== id));
}

export function resetWorkbenchPanels(): void {
  memoryOverride = undefined;
  lastRaw = undefined;
  snapshot = EMPTY;
}
