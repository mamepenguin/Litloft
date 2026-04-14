export type AddonScope = "drive" | "global" | "both";

export interface AddonMeta {
  label: string;
  icon: string;
  href?: string;
  type?: "in_process" | "external_service";
  scope?: AddonScope;
  slots?: Record<string, SlotEntry[]>;
}

export function addonUrlFor(name: string, meta: AddonMeta, currentDrive: string | null): string | null {
  if (!meta.href) return null;
  const scope = meta.scope ?? "global";
  if (scope === "drive") {
    if (!currentDrive) return null;
    return `/drive/${encodeURIComponent(currentDrive)}/addons/${name}`;
  }
  if (scope === "both") {
    return currentDrive
      ? `/drive/${encodeURIComponent(currentDrive)}/addons/${name}`
      : `/addons/${name}`;
  }
  return `/addons/${name}`;
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

// Cache keyed by drive (null sentinel for the global / no-drive view)
// so switching between drives doesn't pay a round-trip per slot lookup
// while still respecting per-drive addon policy filtering.
const _cacheKey = (drive: string | null) => drive ?? "__global__";
const _cached: Map<string, AddonsStatus> = new Map();
const _fetchPromise: Map<string, Promise<AddonsStatus>> = new Map();

async function fetchAddonsStatus(drive: string | null): Promise<AddonsStatus> {
  const url = drive
    ? `/api/addons/status?drive=${encodeURIComponent(drive)}`
    : "/api/addons/status";
  try {
    const res = await fetch(url, { credentials: "include" });
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

export async function getAddonsStatus(
  drive: string | null = null,
): Promise<AddonsStatus> {
  const key = _cacheKey(drive);
  const cached = _cached.get(key);
  if (cached) return cached;
  let pending = _fetchPromise.get(key);
  if (!pending) {
    pending = fetchAddonsStatus(drive).then((result) => {
      _cached.set(key, result);
      _fetchPromise.delete(key);
      return result;
    });
    _fetchPromise.set(key, pending);
  }
  return pending;
}

export async function getEnabledAddons(
  drive: string | null = null,
): Promise<Record<string, AddonMeta>> {
  const status = await getAddonsStatus(drive);
  return status.addons;
}

export async function getSlots(
  drive: string | null = null,
): Promise<Record<string, SlotEntry[]>> {
  const status = await getAddonsStatus(drive);
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
  _cached.clear();
  _fetchPromise.clear();
}
