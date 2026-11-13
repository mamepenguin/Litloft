import { resolveAppTarget, type AppTarget, type AppTargetParams } from "@/lib/appTarget";
import type { SmartFolder } from "@/types/smartFolder";

export const READING_BASE_KINDS = ["pdf", "epub", "archive"] as const;

export type ReadingTargetParams = AppTargetParams;

export type ReadingTarget = AppTarget;

/** The books of a smart folder, or of the whole drive for `null`. */
export function resolveReadingTarget(folder: SmartFolder | null): ReadingTarget {
  return resolveAppTarget(folder, READING_BASE_KINDS);
}
