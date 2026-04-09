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

  useEffect(() => {
    getAddonsStatus().then((status) => {
      setAddons(status.addons);
      setSlots(status.slots);
      setLoading(false);
    });
  }, []);

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
