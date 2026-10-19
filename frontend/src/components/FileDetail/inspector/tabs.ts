import type { ReactNode } from "react";

import { sortSlotEntries, type SlotEntry } from "@/lib/addons";

export interface InspectorTab {
  id: string;
  label: string;
  content: ReactNode;
  /**
   * An unlisted tab is still built and still mounted — it is the thing
   * that reports whether it has anything.
   */
  listed: boolean;
}

export interface BuildInspectorTabsInput {
  info: { label: string; content: ReactNode };
  coreTabs?: Array<{ id: string; label: string; content: ReactNode | null }>;
  /**
   * `available` undefined means the entry has not answered, and an
   * unanswered tab is listed. Only an explicit `false` unlists it.
   */
  addonTabs?: Array<{
    entry: SlotEntry;
    label: string;
    content: ReactNode;
    available?: boolean;
  }>;
}

/** Nothing here knows an addon's id or name: no core-to-addon dependencies. */
export function buildInspectorTabs({
  info,
  coreTabs = [],
  addonTabs = [],
}: BuildInspectorTabsInput): InspectorTab[] {
  return [
    { id: "info", label: info.label, content: info.content, listed: true },
    ...coreTabs
      // `false` as well as nullish: `chaptersPresent && <ChaptersPanel/>`
      // is how a caller will naturally express a conditional tab, and it
      // yields `false`, not null.
      .filter((tab) => tab.content != null && tab.content !== false)
      .map((tab) => ({
        id: tab.id,
        label: tab.label,
        content: tab.content,
        listed: true,
      })),
    // Sorted here rather than by the caller: `getSlotEntries` hands
    // back the catalogue's raw order.
    ...sortSlotEntries(
      addonTabs.map((tab) => ({ ...tab, priority: tab.entry.priority })),
    )
      .map((tab) => ({
        id: tab.entry.id,
        label: tab.label,
        content: tab.content,
        listed: tab.available !== false,
      })),
  ];
}

export function listedTabs(tabs: InspectorTab[]): InspectorTab[] {
  return tabs.filter((tab) => tab.listed);
}

export function showsTabStrip(tabs: InspectorTab[]): boolean {
  return listedTabs(tabs).length > 1;
}
