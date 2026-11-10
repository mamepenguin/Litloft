"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAddonSlots } from "./AddonSlotsProvider";
import {
  getCachedSlotModule,
  loadAddonSlotModule,
  sortSlotEntries,
  type SlotEntry,
  type SlotModule,
} from "@/lib/addons";
import { slotEntryLabel } from "@/lib/slotLabel";

interface AddonSlotProps {
  id: string;
  props?: Record<string, unknown>;
  /**
   * How the host draws the entries it gets back.
   *
   * There is deliberately no `"menu"`: a menu-shaped slot is the host's
   * own `role="menu"` wrapping `layout="stack"`, with each entry drawing
   * `ActionMenuItem` rows (see `file-actions-menu`).
   */
  layout?: "tabs" | "stack";
  /**
   * Optional allowlist by entry id. When provided, only entries whose
   * `id` is in the list are rendered. Both filters are applied before
   * sorting / tab activation, so an empty resulting set still hides the
   * entire slot (matches the `sorted.length === 0` early return).
   *
   * Used by the Markdown DocumentLayout split to send `knowledge-edit`
   * to the canvas while the rest go to the Inspector.
   */
  includeIds?: string[];
  /**
   * Optional denylist by entry id. Applied after `includeIds`. Same use
   * case as `includeIds`: the Inspector excludes `knowledge-edit` so
   * the editor doesn't render twice.
   */
  excludeIds?: string[];
}

/**
 * One slot entry, loaded and rendered on its own.
 *
 * Exported because the inspector's tab strip composes core tabs and
 * addon tabs into a single list, so it needs one entry at a time rather
 * than the whole slot at once — `AddonSlot` renders every entry it
 * finds, which is the wrong shape when each entry is its own tab.
 */
export function SlotEntryRenderer({
  entry,
  props,
}: {
  entry: SlotEntry;
  props: Record<string, unknown>;
}) {
  const [mod, setMod] = useState<SlotModule | null>(
    () => getCachedSlotModule(entry.addonName ?? "") ?? null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const addonName = entry.addonName;
    if (!addonName) {
      setFailed(true);
      return;
    }
    const cached = getCachedSlotModule(addonName);
    if (cached) {
      setMod(cached);
      return;
    }
    loadAddonSlotModule(addonName)
      .then(setMod)
      .catch(() => setFailed(true));
  }, [entry.addonName]);

  if (failed || !mod) return null;

  const Component = mod.slotComponents?.[entry.id];
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
  // Global namespace: a slot's `i18n_key` names its own addon's.
  const tGlobal = useTranslations();
  const entries = getSlotEntries(id);

  const sorted = useMemo(() => {
    const includeSet = includeIds ? new Set(includeIds) : null;
    const excludeSet = excludeIds ? new Set(excludeIds) : null;
    const filtered = entries.filter((entry) => {
      if (includeSet && !includeSet.has(entry.id)) return false;
      if (excludeSet && excludeSet.has(entry.id)) return false;
      return true;
    });
    return sortSlotEntries(filtered);
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
              {slotEntryLabel(entry, tGlobal)}
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
