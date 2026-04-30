"use client";

import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/config";

interface Props {
  value: Locale;
  onChange: (locale: Locale) => void;
  onNext: () => void;
}

export function LanguageStep({
  value,
  onChange,
  onNext,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tLang = useTranslations("setup.language");
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tLang("title")}
      </h2>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onChange("ja")}
          aria-pressed={value === "ja"}
          className={`rounded-2xl border px-4 py-3 text-left text-sm ${
            value === "ja"
              ? "border-accent bg-accent/10"
              : "border-bg-border bg-bg-card hover:bg-bg-elevated"
          }`}
        >
          {tLang("japanese")}
        </button>
        <button
          type="button"
          onClick={() => onChange("en")}
          aria-pressed={value === "en"}
          className={`rounded-2xl border px-4 py-3 text-left text-sm ${
            value === "en"
              ? "border-accent bg-accent/10"
              : "border-bg-border bg-bg-card hover:bg-bg-elevated"
          }`}
        >
          {tLang("english")}
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!value}
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}

export default LanguageStep;
