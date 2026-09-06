"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs, type PageTabItem } from "@/components/PageTabs";
import { DrivesSection } from "./DrivesSection";
import { PasswordsSection } from "./PasswordsSection";
import { AddonPolicySection } from "./AddonPolicySection";

type Tab = "system" | "intelligence";

const PANEL_ID: Record<Tab, string> = {
  system: "settings-panel-system",
  intelligence: "settings-panel-intelligence",
};

export default function AdminSettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  const [activeTab, setActiveTab] = useState<Tab>("system");
  const { hasSlot, loading } = useAddonSlots();
  const hasIntelligence = !loading && hasSlot("admin-intelligence-sections");

  const items: PageTabItem[] = [
    {
      key: "system",
      label: t("tabs.system"),
      controls: PANEL_ID.system,
    },
    ...(hasIntelligence
      ? [
          {
            key: "intelligence",
            label: t("tabs.intelligence"),
            controls: PANEL_ID.intelligence,
          },
        ]
      : []),
  ];

  return (
    // `w-full` is not decoration. This div is a flex item of the
    // AppShell's `<main>`, and `mx-auto` gives it automatic cross-axis
    // margins, which opt it out of `stretch` — so its width becomes
    // fit-content, i.e. its own min-content, and the policy table's
    // headings do not wrap. Measured at 375px: `main` 360, this div
    // **608**; the whole page scrolled sideways and the table's own
    // `overflow-x-auto` never scrolled, because it had been handed all
    // the room it asked for. `w-full` makes the width definite again;
    // `max-w-3xl` still caps it and `mx-auto` still centres it.
    // `MarkdownImagesPresenter` and `/settings` already carried this pair,
    // which is why neither of them ever showed the defect.
    <div className="mx-auto w-full min-w-0 max-w-3xl py-2">
      <PageHeader
        title={t("title")}
        // One tab is not a choice, so with intelligence absent the row is
        // not drawn at all rather than drawn holding a single selected
        // item. The panel below keeps its `role`, because it is still the
        // thing this page shows.
        tabs={
          items.length > 1 ? (
            <PageTabs
              items={items}
              current={activeTab}
              onSelect={(key) => setActiveTab(key as Tab)}
              label={t("tabsLabel")}
            />
          ) : undefined
        }
      />

      {/* `PageHeader` brings its own `px-4`; the panels match it. Both stay
          mounted and are hidden with `display:none`, which also takes them
          out of the focus order. */}
      <div className="px-4 pb-6 pt-4">
        <div
          id={PANEL_ID.system}
          role="tabpanel"
          className={activeTab === "system" ? "space-y-8" : "hidden"}
        >
          <DrivesSection />
          <PasswordsSection />
          <AddonPolicySection />
          <AddonSlot id="admin-settings-sections" layout="stack" />
        </div>

        {hasIntelligence && (
          <div
            id={PANEL_ID.intelligence}
            role="tabpanel"
            className={activeTab === "intelligence" ? "space-y-8" : "hidden"}
          >
            <AddonSlot id="admin-intelligence-sections" layout="stack" />
          </div>
        )}
      </div>
    </div>
  );
}
