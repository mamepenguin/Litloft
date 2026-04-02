"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { type Locale, locales } from "@/i18n/config";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();

  function handleToggle() {
    const currentIndex = locales.indexOf(locale);
    const nextLocale = locales[(currentIndex + 1) % locales.length];
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;SameSite=Strict`;
    router.refresh();
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-1 rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      aria-label={`Language: ${locale.toUpperCase()}`}
      title={`Language: ${locale.toUpperCase()}`}
    >
      <Languages size={14} />
      <span className="text-xs font-medium">{locale.toUpperCase()}</span>
    </button>
  );
}
