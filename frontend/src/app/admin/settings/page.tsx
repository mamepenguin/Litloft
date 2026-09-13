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

const TAB_ID: Record<Tab, string> = {
  system: "settings-tab-system",
  intelligence: "settings-tab-intelligence",
};

export default function AdminSettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  const [activeTab, setActiveTab] = useState<Tab>("system");
  const { hasSlot, loading } = useAddonSlots();
  const hasIntelligence = !loading && hasSlot("admin-intelligence-sections");

  const items: PageTabItem[] = [
    {
      key: "system",
      id: TAB_ID.system,
      label: t("tabs.system"),
      controls: PANEL_ID.system,
    },
    ...(hasIntelligence
      ? [
          {
            key: "intelligence",
            id: TAB_ID.intelligence,
            label: t("tabs.intelligence"),
            controls: PANEL_ID.intelligence,
          },
        ]
      : []),
  ];

  const tabbed = items.length > 1;

  return (
    // `w-full` is not decoration. This div is a flex item of the
    // AppShell's `<main>`, and `mx-auto` gives it automatic cross-axis
    // margins, which opt it out of `stretch` — so its width becomes
    // its own min-content and the policy table's `overflow-x-auto` never
    // scrolls.
    <div className="mx-auto w-full min-w-0 max-w-3xl py-2">
      <PageHeader
        title={t("title")}
        // One tab is not a choice, so with intelligence absent the row is
        // not drawn at all.
        tabs={
          tabbed ? (
            <PageTabs
              items={items}
              current={activeTab}
              onSelect={(key) => setActiveTab(key as Tab)}
              label={t("tabsLabel")}
            />
          ) : undefined
        }
      />

      <div className="px-4 pb-6 pt-4">
        <div
          id={PANEL_ID.system}
          role={tabbed ? "tabpanel" : undefined}
          aria-labelledby={tabbed ? TAB_ID.system : undefined}
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
            aria-labelledby={TAB_ID.intelligence}
            className={activeTab === "intelligence" ? "space-y-8" : "hidden"}
          >
            <AddonSlot id="admin-intelligence-sections" layout="stack" />
          </div>
        )}
      </div>
    </div>
  );
}
