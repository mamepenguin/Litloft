"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { DrivesSection } from "./DrivesSection";
import { PasswordsSection } from "./PasswordsSection";
import { AddonPolicySection } from "./AddonPolicySection";

type Tab = "system" | "intelligence";

export default function AdminSettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  const [activeTab, setActiveTab] = useState<Tab>("system");
  const { hasSlot, loading } = useAddonSlots();
  const hasIntelligence = !loading && hasSlot("admin-intelligence-sections");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">{t("title")}</h1>

      {/* Tab navigation */}
      <div className="mb-8 flex gap-1 rounded-2xl bg-bg-elevated p-1">
        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "system"
              ? "bg-bg-card text-text-primary shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {t("tabs.system")}
        </button>
        {hasIntelligence && (
          <button
            type="button"
            onClick={() => setActiveTab("intelligence")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "intelligence"
                ? "bg-bg-card text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {t("tabs.intelligence")}
          </button>
        )}
      </div>

      {activeTab === "system" && (
        <div className="space-y-8">
          <DrivesSection />
          <PasswordsSection />
          <AddonPolicySection />
          <AddonSlot id="admin-settings-sections" layout="stack" />
        </div>
      )}

      {activeTab === "intelligence" && (
        <div className="space-y-8">
          <AddonSlot id="admin-intelligence-sections" layout="stack" />
        </div>
      )}
    </div>
  );
}
