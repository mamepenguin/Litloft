"use client";

import type { SlotEntry } from "./addons";

/**
 * What to call a slot entry on screen.
 *
 * A manifest's `label` is an English literal — `"Transcript"` — because
 * a manifest is a declaration, not a catalogue. Rendering it directly
 * is how an English tab ended up in a row of Japanese ones. An entry
 * may name a translation key instead, and this prefers it.
 *
 * Falls back rather than throwing, in both directions: an entry with no
 * key keeps working, and so does one whose key is missing from the
 * catalogue — an addon can ship a key before its translations reach the
 * merged output, and a tab reading "Transcript" is better than a tab
 * reading `intelligence.slots.transcript` or no tab at all.
 *
 * @param t  A translator with a global namespace — `useTranslations()`
 *   with no argument — since the key names its own addon's namespace.
 */
export function slotEntryLabel(
  entry: Pick<SlotEntry, "label" | "i18n_key">,
  t: (key: string) => string,
): string {
  if (!entry.i18n_key) return entry.label;
  try {
    const translated = t(entry.i18n_key);
    // next-intl hands back the key itself when it cannot resolve one,
    // and some setups hand back the key with its namespace in front. A
    // resolved label never contains its own dotted key, so treat either
    // as "not found" rather than printing plumbing at the reader.
    if (!translated || translated.endsWith(entry.i18n_key)) return entry.label;
    return translated;
  } catch {
    return entry.label;
  }
}
