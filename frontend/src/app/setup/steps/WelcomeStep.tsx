"use client";

// WelcomeStep: localized intro screen that sits between LanguageStep and
// DriveStep. Shows a greeting, a short pitch, and a preview of the five
// upcoming setup items. The Stepper is hidden on this step (handled by
// the parent SetupWizard).

import { useTranslations } from "next-intl";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function WelcomeStep({ onNext, onBack }: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tWelcome = useTranslations("setup.welcome");

  return (
    <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">
            {tWelcome("greeting")}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-text-muted">
            {tWelcome("intro")}
          </p>
        </div>

        <div className="rounded-xl bg-bg-elevated p-5">
          <h3 className="text-sm font-semibold text-text-primary">
            {tWelcome("stepsTitle")}
          </h3>
          <ol className="mt-3 space-y-2 text-sm text-text-muted">
            <li>1. {tWelcome("steps.drive")}</li>
            <li>2. {tWelcome("steps.accessMode")}</li>
            <li>
              3. {tWelcome("steps.password")} {tWelcome("steps.passwordCondition")}
            </li>
            <li>4. {tWelcome("steps.addonPolicy")}</li>
            <li>5. {tWelcome("steps.complete")}</li>
          </ol>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl bg-sand px-4 py-2 text-sm hover:bg-sand-hover"
          >
            {t("back")}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {tWelcome("startButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeStep;
