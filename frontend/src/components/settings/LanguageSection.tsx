"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type Locale, locales } from "@/i18n/config";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Native names so each option remains recognizable regardless of the
// currently active UI language. Intentionally not localized.
const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

function writeLocaleCookie(next: Locale): void {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? " Secure;"
      : "";
  document.cookie = `NEXT_LOCALE=${encodeURIComponent(next)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Strict;${secure}`;
}

export function LanguageSection() {
  const t = useTranslations("settings.language");
  const current = useLocale() as Locale;
  const router = useRouter();

  function handleSelect(next: Locale) {
    if (next === current) return;
    writeLocaleCookie(next);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="settings-language-title"
      className="rounded-xl border border-bg-border bg-bg-card p-6"
    >
      <h2
        id="settings-language-title"
        className="mb-4 text-base font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {locales.map((value) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelect(value)}
              className={`rounded-2xl border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-bg-border bg-bg-card text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              }`}
            >
              {LOCALE_LABELS[value]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
