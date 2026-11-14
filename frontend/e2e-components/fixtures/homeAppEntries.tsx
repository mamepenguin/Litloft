/**
 * The real Home entry row inside a container of the width the query string names.
 * `count` is the Inbox count; `addons=0` drops the addon entries; `long=1` adds an
 * addon entry and a Home shortcut whose labels are 80 characters each.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";
import { HomeAppEntries } from "@/components/home/HomeAppEntries";
import { addonNavEntries } from "@/lib/addonNavigation";
import type { AddonMeta } from "@/lib/addons";

const DRIVE = "fixture";

function addon(label: string, priority: number, icon: string): AddonMeta {
  return {
    label,
    icon: "package",
    href: "/drive/{drive}/addons/x",
    scope: "drive",
    navigation: { label, placement: "primary", priority, icon },
  };
}

const CATALOGUE: Record<string, AddonMeta> = {
  intelligence: addon("Ask", 10, "message-circle-question"),
  knowledge: addon("Notes", 20, "notebook-pen"),
  photo_diary: addon("Photo Diary", 30, "images"),
};

const LONG_ADDON_LABEL = "Field notes, photos and sensor exports gathered across three years of farm trips";
const LONG_SHORTCUT_LABEL = "Lecture recordings and papers from one long running research project on soil use";

const LONG_ADDON: Record<string, AddonMeta> = {
  field_notes: addon(LONG_ADDON_LABEL, 40, "notebook-pen"),
};

const LONG_SHORTCUTS = [
  { kind: "collection" as const, id: "col000000001", name: LONG_SHORTCUT_LABEL, query: null, file_type: null },
];

export function HomeAppEntriesArrangement(): ReactElement {
  const q = new URLSearchParams(location.search);
  const width = Number(q.get("width") ?? 358);
  const count = Number(q.get("count") ?? 3);
  const locale = q.get("locale") === "ja" ? "ja" : "en";
  const long = q.get("long") === "1";
  const catalogue = long ? { ...CATALOGUE, ...LONG_ADDON } : CATALOGUE;
  const entries = q.get("addons") === "0" ? [] : addonNavEntries(catalogue, DRIVE, "primary");
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? jaMessages : enMessages}>
      <div id="home-app-entries-host" style={{ width, boxSizing: "border-box" }}>
        <HomeAppEntries
          drive={DRIVE}
          addonEntries={entries}
          inboxCount={count}
          shortcuts={long ? LONG_SHORTCUTS : []}
        />
      </div>
    </NextIntlClientProvider>
  );
}
