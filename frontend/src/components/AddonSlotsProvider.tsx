"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AddonsStatus, SlotEntry } from "@/lib/addons";
import { getAddonsStatus } from "@/lib/addons";
import { useCurrentDrive } from "@/components/CurrentDriveProvider";

// Per-addon status shape mirrors each addon's /status `features` block,
// letting slot components gate UI on feature flags (e.g. transcript_refine
// modes) without a per-component round trip. Values follow the backend
// convention: literal `false` or string "false" mean fully off; any other
// value (true, "manual", "on_index", etc.) counts as enabled.
export type AddonFeatureValue = boolean | string;

export interface AddonStatus {
  features: Record<string, AddonFeatureValue>;
}

interface AddonSlotsContextValue {
  addons: AddonsStatus["addons"];
  slots: Record<string, SlotEntry[]>;
  loading: boolean;
  getSlotEntries: (slotId: string) => SlotEntry[];
  hasSlot: (slotId: string) => boolean;
}

// Mirror of the regex used by the dynamic-import call sites; keeps the
// preloader aligned with what's a legal addon directory name.
const VALID_ADDON_NAME_FOR_PRELOAD = /^[a-z][a-z0-9_-]*$/;

const AddonSlotsContext = createContext<AddonSlotsContextValue>({
  addons: {},
  slots: {},
  loading: true,
  getSlotEntries: () => [],
  hasSlot: () => false,
});

export function AddonSlotsProvider({ children }: { children: ReactNode }) {
  const [addons, setAddons] = useState<AddonsStatus["addons"]>({});
  const [slots, setSlots] = useState<Record<string, SlotEntry[]>>({});
  const [loading, setLoading] = useState(true);
  // The catalogue is per-drive: drives.json's addons.<name> can disable
  // an addon entirely (e.g. work drive opts out of intelligence). When
  // the user navigates between drives we re-fetch so the slots and
  // sidebar links match the active drive's policy.
  const drive = useCurrentDrive();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAddonsStatus(drive).then((status) => {
      if (cancelled) return;
      setAddons(status.addons);
      setSlots(status.slots);
      setLoading(false);
      // Eagerly preload each active addon's slot module. Some addons
      // (e.g. media_import) rely on side-effect imports inside slots.ts
      // to register .loft players before LoftPlayer dispatches; without
      // this preload, the registration would only fire after the user
      // hits a file detail page, racing the LoftPlayer mount.
      Object.keys(status.addons).forEach((name) => {
        if (!VALID_ADDON_NAME_FOR_PRELOAD.test(name)) return;
        import(`@/addons/${name}/slots.ts`).catch(() => {});
      });
    });
    return () => {
      cancelled = true;
    };
  }, [drive]);

  const getSlotEntries = (slotId: string): SlotEntry[] => slots[slotId] ?? [];
  const hasSlot = (slotId: string): boolean => {
    const entries = slots[slotId];
    return !!entries && entries.length > 0;
  };

  return (
    <AddonSlotsContext.Provider
      value={{ addons, slots, loading, getSlotEntries, hasSlot }}
    >
      {children}
    </AddonSlotsContext.Provider>
  );
}

export function useAddonSlots() {
  return useContext(AddonSlotsContext);
}

const DEFAULT_STATUS: AddonStatus = { features: {} };

// Cache keyed by `${addonName}|${drive ?? ""}`. Multiple components can
// call useAddonStatus("intelligence") in the same drive without each
// firing its own fetch.
const _statusCache: Map<string, AddonStatus> = new Map();
const _statusPromise: Map<string, Promise<AddonStatus>> = new Map();

function statusKey(addonName: string, drive: string | null): string {
  return `${addonName}|${drive ?? ""}`;
}

async function fetchAddonStatus(
  addonName: string,
  drive: string,
  signal: AbortSignal,
): Promise<AddonStatus> {
  const res = await fetch(`/api/addons/${encodeURIComponent(addonName)}/status`, {
    credentials: "include",
    headers: { "X-Lit-Drive": encodeURIComponent(drive) },
    signal,
  });
  if (!res.ok) return DEFAULT_STATUS;
  const data = (await res.json()) as { features?: Record<string, AddonFeatureValue> } | null;
  return { features: data?.features ?? {} };
}

// Generic per-addon status hook. The host doesn't pre-fetch /status for
// any addon; each consumer (always inside the addon's own components)
// requests its own. Drive switches and addon name swaps both invalidate.
export function useAddonStatus(addonName: string): AddonStatus {
  const drive = useCurrentDrive();
  const key = statusKey(addonName, drive);
  const [status, setStatus] = useState<AddonStatus>(
    () => _statusCache.get(key) ?? DEFAULT_STATUS,
  );

  useEffect(() => {
    if (!drive) {
      setStatus(DEFAULT_STATUS);
      return;
    }
    const cached = _statusCache.get(key);
    if (cached) {
      setStatus(cached);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let pending = _statusPromise.get(key);
    if (!pending) {
      pending = fetchAddonStatus(addonName, drive, controller.signal)
        .then((result) => {
          _statusCache.set(key, result);
          _statusPromise.delete(key);
          return result;
        })
        .catch(() => {
          _statusPromise.delete(key);
          return DEFAULT_STATUS;
        });
      _statusPromise.set(key, pending);
    }
    pending.then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [addonName, drive, key]);

  return status;
}
