import type { AddonsStatus } from "./addons";

const API_BASE = "/api";

export function addonsStatusUrl(drive: string | null): string {
  return drive
    ? `${API_BASE}/addons/status?drive=${encodeURIComponent(drive)}`
    : `${API_BASE}/addons/status`;
}

export interface AddonsStatusAnswer {
  /** Separates "the drive has no addon" from "the status could not be read". */
  answered: boolean;
  status: AddonsStatus;
}

export async function readAddonsStatus(res: Response): Promise<AddonsStatusAnswer> {
  if (!res.ok) return { answered: false, status: { addons: {}, slots: {} } };
  const data = (await res.json()) as Partial<AddonsStatus> | null;
  return {
    answered: true,
    status: {
      addons: data?.addons ?? {},
      slots: data?.slots ?? {},
    },
  };
}
