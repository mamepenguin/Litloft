import { TYPE_OPTION_KEYS } from "@/components/folder/filterOptions";

/**
 * `text` and `pdf` are dropped: they are narrowings of `document` in the
 * filter, and the backend's `file_type` column never holds them.
 */
const NARROWINGS_OF_DOCUMENT = new Set(["text", "pdf"]);

export const DRIVE_TYPE_ORDER = TYPE_OPTION_KEYS.map((o) => o.value).filter(
  (v): v is Exclude<typeof v, null> =>
    v !== null && !NARROWINGS_OF_DOCUMENT.has(v),
);

export type DriveTypeKey = (typeof DRIVE_TYPE_ORDER)[number];

/**
 * A kind the order does not name is folded into `other` rather than
 * dropped: the backend computes the file count printed above this line as
 * `sum(file_types.values())`, so discarding it would leave the breakdown
 * adding up to less than the count.
 */
export function driveTypeCounts(
  fileTypes: Record<string, number>,
): Array<{ type: DriveTypeKey; count: number }> {
  const known = new Set<string>(DRIVE_TYPE_ORDER);
  const counts = new Map<string, number>(DRIVE_TYPE_ORDER.map((t) => [t, 0]));
  for (const [type, count] of Object.entries(fileTypes)) {
    const bucket = known.has(type) ? type : "other";
    counts.set(bucket, (counts.get(bucket) ?? 0) + count);
  }
  return DRIVE_TYPE_ORDER.map((type) => ({ type, count: counts.get(type)! }));
}
