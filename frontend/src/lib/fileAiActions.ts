"use client";

/**
 * Offers for a file's "AI" menu: things an addon can generate for the file,
 * collected from whichever components know how to make them.
 *
 * A module-level store rather than a context: the menu and the offering
 * components are mounted by different `AddonSlot`s, from different addons,
 * with no shared ancestor a provider could wrap.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";

export interface FileAiAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Ascending; ties fall back to `id` so mount order never reorders the menu. */
  order: number;
  busy: boolean;
  run: () => void;
}

const EMPTY: readonly FileAiAction[] = [];

/**
 * Keyed by file, then offer id, then the offering component. The inner key
 * keeps two mounts of one offer (inspector and bottom sheet) from cancelling
 * each other when one of them unmounts.
 */
const registry = new Map<string, Map<string, Map<symbol, FileAiAction>>>();
const listeners = new Set<() => void>();
let snapshots = new Map<string, readonly FileAiAction[]>();

function publish(): void {
  // `useSyncExternalStore` compares snapshots by identity: rebuilt on change,
  // stable in between, or every read re-renders.
  snapshots = new Map();
  for (const listener of listeners) listener();
}

function offer(by: symbol, fileId: string, action: FileAiAction): void {
  const byId = registry.get(fileId) ?? new Map<string, Map<symbol, FileAiAction>>();
  const held = byId.get(action.id) ?? new Map<symbol, FileAiAction>();
  held.set(by, action);
  byId.set(action.id, held);
  registry.set(fileId, byId);
  publish();
}

function withdraw(by: symbol, fileId: string, id: string): void {
  const byId = registry.get(fileId);
  const held = byId?.get(id);
  if (!byId || !held?.delete(by)) return;
  if (held.size === 0) byId.delete(id);
  if (byId.size === 0) registry.delete(fileId);
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(fileId: string): readonly FileAiAction[] {
  const cached = snapshots.get(fileId);
  if (cached) return cached;
  const byId = registry.get(fileId);
  const built: FileAiAction[] = [];
  for (const held of byId?.values() ?? []) {
    const first = held.values().next();
    if (!first.done) built.push(first.value);
  }
  built.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const result = built.length > 0 ? built : EMPTY;
  snapshots.set(fileId, result);
  return result;
}

export function useFileAiActions(fileId: string): readonly FileAiAction[] {
  const getSnapshot = useCallback(() => read(fileId), [fileId]);
  const getServerSnapshot = useCallback(() => EMPTY, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Offer an action to this file's "AI" menu for as long as `active` holds.
 *
 * Call it above the component's early returns: a component with nothing to
 * show yet is usually the one with something to offer.
 */
export function useOfferFileAiAction(params: {
  fileId: string;
  id: string;
  label: string;
  icon: LucideIcon;
  order: number;
  active: boolean;
  busy?: boolean;
  run: () => void;
}): void {
  const { fileId, id, label, icon, order, active, busy = false, run } = params;

  // `run` is usually a fresh closure each render; republishing on it would
  // re-render the menu on every render of the offerer.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const registrantRef = useRef<symbol | null>(null);
  if (registrantRef.current === null) registrantRef.current = Symbol(id);
  const registrant = registrantRef.current;

  useEffect(() => {
    if (!active) return;
    offer(registrant, fileId, {
      id,
      label,
      icon,
      order,
      busy,
      run: () => runRef.current(),
    });
    return () => withdraw(registrant, fileId, id);
  }, [registrant, fileId, id, label, icon, order, active, busy]);
}

/** Test seam: drop every offer. */
export function resetFileAiActions(): void {
  registry.clear();
  publish();
}
