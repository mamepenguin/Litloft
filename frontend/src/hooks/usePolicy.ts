"use client";

import { useEffect, useState } from "react";

/**
 * Drive-scoped addon policy lookup hook.
 *
 * Frontend mirror of the backend `is_addon_feature_enabled` helper. Fetches
 * `/api/drives/{drive}/addon-policies` once per drive and caches the result at
 * module level with a 30s TTL (matching the backend `policy_client` cadence).
 *
 * Resolution order, identical to backend:
 *   addons[addon].features[feature]  ??  addons[addon].default  ??  true
 *
 * Fail-open: while loading, on fetch error, or on non-2xx, returns
 * `enabled=true` so a policy outage never blackholes the UI. Spec:
 * docs/superpowers/specs/2026-05-10-markdown-document-layout.md § 4 D4.
 */

export interface PolicyState {
  enabled: boolean;
  isLoading: boolean;
}

interface AddonPolicy {
  default: boolean;
  features: Record<string, boolean>;
}

interface PolicyResponse {
  addons: Record<string, AddonPolicy>;
}

interface CacheEntry {
  // Either a resolved snapshot or a still-pending fetch promise — never both.
  data: PolicyResponse | null;
  fetchedAt: number;
  inFlight: Promise<PolicyResponse | null> | null;
}

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(drive: string): void {
  const set = listeners.get(drive);
  if (!set) return;
  // Copy before iterating so a listener that unsubscribes mid-flight doesn't
  // mutate the set we're walking.
  for (const listener of [...set]) listener();
}

function subscribe(drive: string, listener: () => void): () => void {
  let set = listeners.get(drive);
  if (!set) {
    set = new Set();
    listeners.set(drive, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(drive);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(drive);
  };
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

function resolveEnabled(
  data: PolicyResponse | null,
  addon: string,
  feature: string,
): boolean {
  if (!data) return true;
  const addonPolicy = data.addons?.[addon];
  if (!addonPolicy) return true;
  const featureValue = addonPolicy.features?.[feature];
  if (typeof featureValue === "boolean") return featureValue;
  if (typeof addonPolicy.default === "boolean") return addonPolicy.default;
  return true;
}

async function fetchPolicy(drive: string): Promise<PolicyResponse | null> {
  try {
    const res = await fetch(
      `/api/drives/${encodeURIComponent(drive)}/addon-policies`,
      {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as PolicyResponse;
    return json;
  } catch {
    // Fail-open: cache an empty response for the TTL window so we don't
    // hammer a flaky endpoint.
    return null;
  }
}

function ensureFetch(drive: string): CacheEntry {
  const existing = cache.get(drive);
  if (existing && (existing.inFlight || isFresh(existing))) {
    return existing;
  }

  const entry: CacheEntry = {
    data: existing?.data ?? null,
    fetchedAt: existing?.fetchedAt ?? 0,
    inFlight: null,
  };

  const promise = fetchPolicy(drive).then((data) => {
    const next: CacheEntry = {
      data,
      fetchedAt: Date.now(),
      inFlight: null,
    };
    cache.set(drive, next);
    notify(drive);
    return data;
  });

  entry.inFlight = promise;
  cache.set(drive, entry);
  return entry;
}

export function usePolicy(
  drive: string,
  addon: string,
  feature: string,
): PolicyState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe(drive, () => setTick((n) => n + 1));
    const entry = cache.get(drive);
    if (!entry || (!entry.inFlight && !isFresh(entry))) {
      ensureFetch(drive);
      // ensureFetch may have set a new entry; trigger a render so isLoading
      // reflects the in-flight promise on first paint.
      setTick((n) => n + 1);
    }
    return unsubscribe;
  }, [drive]);

  // Synchronously kick off the fetch on first render so dedupe works even
  // when two consumers mount in the same tick (before effects run).
  const current = cache.get(drive);
  if (!current || (!current.inFlight && !isFresh(current))) {
    ensureFetch(drive);
  }

  const entry = cache.get(drive);
  const isLoading = !!entry?.inFlight && !(entry && isFresh(entry));
  const data = entry && isFresh(entry) ? (entry.data ?? null) : null;

  if (isLoading) {
    return { enabled: true, isLoading: true };
  }
  return {
    enabled: resolveEnabled(data, addon, feature),
    isLoading: false,
  };
}

export function _resetPolicyCache(): void {
  cache.clear();
  listeners.clear();
}
