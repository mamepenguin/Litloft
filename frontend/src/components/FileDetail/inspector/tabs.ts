import type { ReactNode } from "react";

import type { SlotEntry } from "@/lib/addons";

export interface InspectorTab {
  /** Stable across renders; used as the React key and the panel id. */
  id: string;
  label: string;
  content: ReactNode;
}

export interface BuildInspectorTabsInput {
  /** Always present. The universal half of the inspector. */
  info: { label: string; content: ReactNode };
  /**
   * Core tabs that exist only for some file kinds — chapters for media,
   * EXIF for an image, a page list for an archive. Each is dropped when
   * it has nothing in it.
   */
  coreTabs?: Array<{ id: string; label: string; content: ReactNode | null }>;
  /**
   * Addon-supplied tabs, one per `player-side` entry, already resolved
   * to a label and a rendered node by the caller.
   */
  addonTabs?: Array<{ entry: SlotEntry; label: string; content: ReactNode }>;
}

/**
 * Which tabs the inspector shows, and in what order.
 *
 * The order is core-before-addon and, within the addons, whatever
 * priority the catalogue already sorted them into. Core's own tabs are
 * listed by the caller in the order they should appear.
 *
 * Two rules, both of which exist to keep the strip honest:
 *
 * 1. **A tab with no content is not a tab.** The redesign's first
 *    principle is that a thing which does not exist yet should not take
 *    a row — a heading that only says a feature could exist. A tab is a
 *    row. So "the archive gets a page-list tab" means "when there is a
 *    page list", and when Phase 4 gives the PDF viewer one, its tab
 *    appears without anyone editing this file.
 * 2. **One tab is no tab strip.** A strip with a single tab is chrome
 *    that answers a question nobody asked; a Markdown note's inspector
 *    then looks exactly as it did before any of this, which is what the
 *    design asked for.
 *
 * Nothing here knows an addon's id or name. Tabs arrive as slot entries
 * — the generic container core already defines — so an addon publishing
 * a second `player-side` entry gets a second tab with no core change,
 * and core never learns the word "transcript"
 * (`.claude/rules/design-decisions.md`, "No core-to-addon dependencies").
 */
export function buildInspectorTabs({
  info,
  coreTabs = [],
  addonTabs = [],
}: BuildInspectorTabsInput): InspectorTab[] {
  return [
    { id: "info", label: info.label, content: info.content },
    ...coreTabs
      // `false` as well as nullish: `chaptersPresent && <ChaptersPanel/>`
      // is how a caller will naturally express a conditional tab, and it
      // yields `false`, not null.
      .filter((tab) => tab.content != null && tab.content !== false)
      .map((tab) => ({ id: tab.id, label: tab.label, content: tab.content })),
    // Sorted here rather than by the caller. `getSlotEntries` hands
    // back the catalogue's raw order, and `AddonSlot` — which does its
    // own sort — is not in this path, so a caller composing tabs by
    // hand would silently drop the ordering an addon declared.
    ...[...addonTabs]
      .sort((a, b) => a.entry.priority - b.entry.priority)
      .map((tab) => ({
        id: tab.entry.id,
        label: tab.label,
        content: tab.content,
      })),
  ];
}

/** Whether the strip is worth drawing at all. */
export function showsTabStrip(tabs: InspectorTab[]): boolean {
  return tabs.length > 1;
}
