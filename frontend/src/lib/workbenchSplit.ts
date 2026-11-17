"use client";

import { useSyncExternalStore } from "react";

import { WORKBENCH_SPLIT_MIN_REM } from "./layoutSizes";

const STORAGE_KEY = "workbench-split";

type Listener = () => void;

const listeners = new Set<Listener>();

let memoryOverride: string | undefined;

function readRaw(): string | null {
  if (memoryOverride !== undefined) return memoryOverride;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function read(): boolean {
  return readRaw() === "true";
}

function write(next: boolean): void {
  const raw = String(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    memoryOverride = undefined;
  } catch {
    memoryOverride = raw;
  }
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

function getServerSnapshot(): boolean {
  return false;
}

export function useWorkbenchSplit(): boolean {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

export function toggleWorkbenchSplit(): void {
  write(!read());
}

export function resetWorkbenchSplit(): void {
  memoryOverride = undefined;
}

export function splitFits(width: number, rootFontSize: number): boolean {
  return width >= WORKBENCH_SPLIT_MIN_REM * rootFontSize;
}
