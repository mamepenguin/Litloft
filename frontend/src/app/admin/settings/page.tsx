"use client";

import { useTranslations } from "next-intl";

import { AddonSlot } from "@/components/AddonSlot";
import { DrivesSection } from "./DrivesSection";
import { PasswordsSection } from "./PasswordsSection";
import { AddonPolicySection } from "./AddonPolicySection";

export default function AdminSettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-text-primary">{t("title")}</h1>
      <DrivesSection />
      <PasswordsSection />
      <AddonPolicySection />
      <AddonSlot id="admin-settings-sections" layout="stack" />
    </div>
  );
}
