"use client";

import { useTranslations } from "next-intl";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { ProfileGuide } from "@/components/settings/ProfileGuide";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { LanguageSection } from "@/components/settings/LanguageSection";
import { SidebarResetSection } from "@/components/settings/SidebarResetSection";

export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-text-primary">{t("title")}</h1>
      <ProfileSection />
      <ProfileGuide />
      <AppearanceSection />
      <LanguageSection />
      <SidebarResetSection />
    </main>
  );
}
