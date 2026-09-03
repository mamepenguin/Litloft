"use client";

// LanguageStep: language-agnostic intro screen. Renders the brand mark
// and a tiny neutral subtitle only. Two large language buttons drive the
// locale selection and a small arrow advances to the Welcome step.

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
    <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
      <div className="space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold text-accent">Litloft</h1>
          <p className="mt-2 text-sm text-text-muted">Setup</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange("en")}
            aria-pressed={value === "en"}
            className={`rounded-2xl border px-6 py-5 text-base font-medium transition-colors ${
              value === "en"
                ? "border-accent bg-accent/10 text-text-primary"
                : "border-bg-border bg-bg-card text-text-primary hover:bg-bg-elevated"
            }`}
          >
            {tLang("english")}
          </button>
          <button
            type="button"
            onClick={() => onChange("ja")}
            aria-pressed={value === "ja"}
            className={`rounded-2xl border px-6 py-5 text-base font-medium transition-colors ${
              value === "ja"
                ? "border-accent bg-accent/10 text-text-primary"
                : "border-bg-border bg-bg-card text-text-primary hover:bg-bg-elevated"
            }`}
          >
            {tLang("japanese")}
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            disabled={!value}
            aria-label={t("next")}
            className="rounded-2xl bg-accent px-5 py-2.5 text-base font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sand disabled:text-warm-silver "
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export default LanguageStep;
