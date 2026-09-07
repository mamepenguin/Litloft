"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/PageHeader";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { ProfileGuide } from "@/components/settings/ProfileGuide";
import { PreferencesSection } from "@/components/settings/PreferencesSection";

export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <main className="mx-auto w-full max-w-2xl py-8">
      {/* PageHeader carries its own `px-4` (DESIGN.md §Page Header), so the
          sections get theirs from a wrapper rather than from <main>, which
          would otherwise pad the header twice. */}
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-8 px-4">
        <ProfileSection />
        <ProfileGuide />
        <PreferencesSection />
      </div>
    </main>
  );
}
