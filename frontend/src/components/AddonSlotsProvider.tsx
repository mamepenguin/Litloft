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

// Per-addon status exposed to slot components. Currently only intelligence
// consumes this; the shape mirrors the backend /status features block so
// feature-flag gates (e.g. transcript_refine) can hide UI without a
// per-component round trip. Values follow the backend convention: either
// the literal boolean `false` to mean "fully off" or a string mode like
// "manual"/"on_index"/"true".
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
  addonStatuses: Record<string, AddonStatus>;
}

const AddonSlotsContext = createContext<AddonSlotsContextValue>({
  addons: {},
  slots: {},
  loading: true,
  getSlotEntries: () => [],
  hasSlot: () => false,
  addonStatuses: {},
});

export function AddonSlotsProvider({ children }: { children: ReactNode }) {
  const [addons, setAddons] = useState<AddonsStatus["addons"]>({});
  const [slots, setSlots] = useState<Record<string, SlotEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [addonStatuses, setAddonStatuses] = useState<Record<string, AddonStatus>>({});
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
    });
    return () => {
      cancelled = true;
    };
  }, [drive]);

  // Fetch per-addon feature flags for addons that expose a /status
  // endpoint. Intelligence is the only such addon today; the fetch is
  // drive-scoped because per-drive policy can flip features on/off.
  useEffect(() => {
    if (!drive) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/addons/intelligence/status`, {
      credentials: "include",
      headers: { "X-Lit-Drive": encodeURIComponent(drive) },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { features?: Record<string, AddonFeatureValue> } | null) => {
        if (cancelled || !data) return;
        setAddonStatuses((prev) => ({
          ...prev,
          intelligence: { features: data.features ?? {} },
        }));
      })
      .catch(() => {
        // non-fatal: addon may be disabled for this drive
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [drive]);

  const getSlotEntries = (slotId: string): SlotEntry[] => slots[slotId] ?? [];
  const hasSlot = (slotId: string): boolean => {
    const entries = slots[slotId];
    return !!entries && entries.length > 0;
  };

  return (
    <AddonSlotsContext.Provider
      value={{ addons, slots, loading, getSlotEntries, hasSlot, addonStatuses }}
    >
      {children}
    </AddonSlotsContext.Provider>
  );
}

export function useAddonSlots() {
  return useContext(AddonSlotsContext);
}

// Default fallback so components outside the provider (or before the
// status fetch completes) don't need to guard every read. The refine
// UI is opt-in, so absence of status reads as "unknown" — gate
// callers use `!== false && !== "false"` which treats missing as off.
const DEFAULT_STATUS: AddonStatus = { features: {} };

export function useAddonStatus(addonName: string = "intelligence"): AddonStatus {
  const { addonStatuses } = useContext(AddonSlotsContext);
  return addonStatuses[addonName] ?? DEFAULT_STATUS;
}

