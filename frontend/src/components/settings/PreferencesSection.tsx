"use client";

import { useTranslations } from "next-intl";

import { AppearanceSection } from "./AppearanceSection";
import { LanguageSection } from "./LanguageSection";
import { SidebarResetSection } from "./SidebarResetSection";

/**
 * Display, language and sidebar order, in one card.
 *
 * They were three cards with three headings and three borders, holding a
 * three-way choice, a two-way choice and a single button between them.
 * Profile and its guide stay as cards of their own: the first is not one
 * control (a field, a save, a switch, a delete and two dialogs) and the
 * second is prose.
 */
export function PreferencesSection() {
  const t = useTranslations("settings.preferences");

  return (
    <section
      aria-labelledby="settings-preferences-title"
      className="rounded-xl border border-bg-border bg-bg-card p-6"
    >
      <h2
        id="settings-preferences-title"
        className="mb-2 text-base font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <div className="divide-y divide-bg-border">
        <AppearanceSection />
        <LanguageSection />
        <SidebarResetSection />
      </div>
    </section>
  );
}
