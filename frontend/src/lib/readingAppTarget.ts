import { resolveAppTarget, type AppTarget, type AppTargetParams } from "@/lib/appTarget";
import { resolveMemberTarget, type MemberTarget } from "@/lib/memberTarget";
import type { SmartFolder } from "@/types/smartFolder";

export const READING_BASE_KINDS = ["pdf", "epub", "archive"] as const;

export type ReadingTargetParams = AppTargetParams;

export type ReadingTarget = AppTarget;

/** The books of a smart folder, or of the whole drive for `null`. */
export function resolveReadingTarget(folder: SmartFolder | null): ReadingTarget {
  return resolveAppTarget(folder, READING_BASE_KINDS);
}

/** The Smart Collection a target sends members for; `null` when it resolves to listing parameters. */
export function resolveReadingMemberTarget(folder: SmartFolder | null): MemberTarget | null {
  return resolveMemberTarget(folder, READING_BASE_KINDS);
}

/** The kinds a member target's requests carry; `null` when its kinds meet no book. */
export function readingMemberParams(target: MemberTarget): ReadingTargetParams | null {
  return target.kinds.length === 0 ? null : { type: [...target.kinds] };
}

/** A member target can be chosen whatever else its query holds. */
export function isReadingTargetUsable(folder: SmartFolder): boolean {
  return resolveReadingTarget(folder).usable || resolveReadingMemberTarget(folder) !== null;
}
