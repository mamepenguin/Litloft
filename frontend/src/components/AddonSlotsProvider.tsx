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

interface AddonSlotsContextValue {
  addons: AddonsStatus["addons"];
  slots: Record<string, SlotEntry[]>;
  loading: boolean;
  getSlotEntries: (slotId: string) => SlotEntry[];
  hasSlot: (slotId: string) => boolean;
}

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
