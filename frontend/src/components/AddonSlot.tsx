"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useAddonSlots } from "./AddonSlotsProvider";
import type { SlotEntry } from "@/lib/addons";

type SlotModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slotComponents: Record<string, React.LazyExoticComponent<React.ComponentType<any>>>;
};

// Cache loaded addon slot modules to avoid re-importing
const moduleCache = new Map<string, SlotModule>();
const modulePromiseCache = new Map<string, Promise<SlotModule>>();

const VALID_ADDON_NAME = /^[a-z][a-z0-9_-]*$/;

function loadAddonSlotModule(addonName: string): Promise<SlotModule> {
  if (!VALID_ADDON_NAME.test(addonName)) {
    return Promise.reject(new Error(`Invalid addon name: ${addonName}`));
  }

  const cached = modulePromiseCache.get(addonName);
  if (cached) return cached;

  const promise = import(`@/addons/${addonName}/slots.ts`).then((mod: SlotModule) => {
    moduleCache.set(addonName, mod);
    return mod;
  });

  modulePromiseCache.set(addonName, promise);
  return promise;
}

interface AddonSlotProps {
  id: string;
  props?: Record<string, unknown>;
  layout?: "tabs" | "stack" | "menu";
  /**
   * Optional allowlist by entry id. When provided, only entries whose
   * `id` is in the list are rendered. Both filters are applied before
   * sorting / tab activation, so an empty resulting set still hides the
   * entire slot (matches the `sorted.length === 0` early return).
   *
   * Used by the Markdown DocumentLayout split (spec
   * `2026-05-10-markdown-document-layout.md`) to send `knowledge-edit`
   * to the canvas while the rest go to the Inspector. Both undefined →
   * full back-compat (every entry rendered, original behaviour).
   */
  includeIds?: string[];
  /**
   * Optional denylist by entry id. Applied after `includeIds`. Same use
   * case as `includeIds`: the Inspector excludes `knowledge-edit` so
   * the editor doesn't render twice.
   */
  excludeIds?: string[];
}

function SlotEntryRenderer({
  entry,
  props,
}: {
  entry: SlotEntry;
  props: Record<string, unknown>;
}) {
  const [mod, setMod] = useState<SlotModule | null>(
    () => moduleCache.get(entry.addonName ?? "") ?? null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const addonName = entry.addonName;
    if (!addonName) {
      setFailed(true);
      return;
    }
    if (moduleCache.has(addonName)) {
      setMod(moduleCache.get(addonName)!);
      return;
    }
    loadAddonSlotModule(addonName)
      .then(setMod)
      .catch(() => setFailed(true));
  }, [entry.addonName]);

  if (failed || !mod) return null;

  const Component = mod.slotComponents[entry.id];
  if (!Component) return null;

  return (
    <Suspense fallback={null}>
      <Component {...props} />
    </Suspense>
  );
}

export function AddonSlot({
  id,
  props = {},
  layout = "stack",
  includeIds,
  excludeIds,
}: AddonSlotProps) {
  const { getSlotEntries } = useAddonSlots();
  const entries = getSlotEntries(id);

  const sorted = useMemo(() => {
    const includeSet = includeIds ? new Set(includeIds) : null;
    const excludeSet = excludeIds ? new Set(excludeIds) : null;
    const filtered = entries.filter((entry) => {
      if (includeSet && !includeSet.has(entry.id)) return false;
      if (excludeSet && excludeSet.has(entry.id)) return false;
      return true;
    });
    return filtered.sort((a, b) => a.priority - b.priority);
  }, [entries, includeIds, excludeIds]);

  const [activeTab, setActiveTab] = useState(0);

  if (sorted.length === 0) return null;

  if (layout === "tabs") {
    const activeEntry = sorted[activeTab] ?? sorted[0];
    return (
      <div>
        <div className="flex gap-1 border-b border-bg-border px-2 py-1">
          {sorted.map((entry, i) => (
            <button
              key={entry.id}
              onClick={() => setActiveTab(i)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activeTab
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {activeEntry && (
          <SlotEntryRenderer entry={activeEntry} props={props} />
        )}
      </div>
    );
  }

  // Default: stack layout
  return (
    <>
      {sorted.map((entry) => (
        <SlotEntryRenderer key={entry.id} entry={entry} props={props} />
      ))}
    </>
  );
}
