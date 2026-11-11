/**
 * The real Home entry row inside a container of the width the query string names.
 * `count` is the Inbox count; `addons=0` drops the addon entries.
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

export function HomeAppEntriesArrangement(): ReactElement {
  const q = new URLSearchParams(location.search);
  const width = Number(q.get("width") ?? 358);
  const count = Number(q.get("count") ?? 3);
  const locale = q.get("locale") === "ja" ? "ja" : "en";
  const entries = q.get("addons") === "0" ? [] : addonNavEntries(CATALOGUE, DRIVE, "primary");
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? jaMessages : enMessages}>
      <div id="home-app-entries-host" style={{ width, boxSizing: "border-box" }}>
        <HomeAppEntries drive={DRIVE} addonEntries={entries} inboxCount={count} />
      </div>
    </NextIntlClientProvider>
  );
}
