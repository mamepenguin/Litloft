export interface AddonMeta {
  label: string;
  icon: string;
  href?: string;
  type?: "in_process" | "external_service";
  slots?: Record<string, SlotEntry[]>;
}

export interface SlotEntry {
  id: string;
  label: string;
  priority: number;
  addonName?: string;
}

export interface AddonsStatus {
  addons: Record<string, AddonMeta>;
  slots: Record<string, SlotEntry[]>;
}

let _cached: AddonsStatus | null = null;
let _fetchPromise: Promise<AddonsStatus> | null = null;

async function fetchAddonsStatus(): Promise<AddonsStatus> {
  try {
    const res = await fetch("/api/addons/status", { credentials: "include" });
    if (!res.ok) return { addons: {}, slots: {} };
    const data = await res.json();
    return {
      addons: (data.addons as Record<string, AddonMeta>) ?? {},
      slots: (data.slots as Record<string, SlotEntry[]>) ?? {},
    };
  } catch {
    return { addons: {}, slots: {} };
  }
}

export async function getAddonsStatus(): Promise<AddonsStatus> {
  if (_cached) return _cached;
  if (!_fetchPromise) {
    _fetchPromise = fetchAddonsStatus().then((result) => {
      _cached = result;
      _fetchPromise = null;
      return result;
    });
  }
  return _fetchPromise;
}

export async function getEnabledAddons(): Promise<Record<string, AddonMeta>> {
  const status = await getAddonsStatus();
  return status.addons;
}

export async function getSlots(): Promise<Record<string, SlotEntry[]>> {
  const status = await getAddonsStatus();
  return status.slots;
}

export function hasSlotEntries(
  slots: Record<string, SlotEntry[]>,
  slotId: string
): boolean {
  const entries = slots[slotId];
  return !!entries && entries.length > 0;
}

export function invalidateAddonsCache(): void {
  _cached = null;
  _fetchPromise = null;
}
