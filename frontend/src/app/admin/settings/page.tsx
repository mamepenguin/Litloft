"use client";

import { useTranslations } from "next-intl";

import { DrivesSection } from "./DrivesSection";
import { PasswordsSection } from "./PasswordsSection";
import { AddonPolicySection } from "./AddonPolicySection";
import { TranscriptionSettingsSection } from "./TranscriptionSettingsSection";

export default function AdminSettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-text-primary">{t("title")}</h1>
      <DrivesSection />
      <PasswordsSection />
      <AddonPolicySection />
      <TranscriptionSettingsSection />
    </div>
  );
}
