import { TYPE_OPTION_KEYS } from "@/components/folder/filterOptions";

/**
 * The six file kinds a drive card counts, in the order it reads them.
 *
 * The order is not invented here. `TYPE_OPTION_KEYS` is "the one
 * vocabulary, read from the one place it is written" for the filter menu,
 * and a reader who compares a drive card against that menu should see the
 * same six words in the same sequence — two orders for one vocabulary is
 * a difference that means nothing and has to be re-read every time.
 *
 * Derived rather than copied, so the two cannot drift. `markdown` and
 * `pdf` are dropped: they are narrowings of `document` in the filter, and
 * the backend's `file_type` column never holds them — every markdown file
 * is counted as a `document` there.
 */
const NARROWINGS_OF_DOCUMENT = new Set(["markdown", "pdf"]);

export const DRIVE_TYPE_ORDER = TYPE_OPTION_KEYS.map((o) => o.value).filter(
  (v): v is Exclude<typeof v, null> =>
    v !== null && !NARROWINGS_OF_DOCUMENT.has(v),
);

export type DriveTypeKey = (typeof DRIVE_TYPE_ORDER)[number];

/**
 * The counts, in `DRIVE_TYPE_ORDER`, always all of them.
 *
 * The response cannot supply either half of that: `file_types` comes from
 * a `group_by` (`routers/admin.py`) with no guaranteed order, and it omits
 * whatever is zero — so the card drew a different number of figures in a
 * different sequence for every drive, and two cards could not be compared.
 *
 * A kind the order does not name is folded into `other` rather than
 * dropped. `FileType` has seven members and this has six; `subtitle` is
 * the one left out, and the backend computes the file count printed above
 * this line as `sum(file_types.values())`, so discarding it would leave
 * the breakdown adding up to less than the count with nothing on screen
 * saying why.
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
