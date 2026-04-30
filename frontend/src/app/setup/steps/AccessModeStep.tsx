"use client";

// AccessModeStep: choose between public (no auth) and protected
// (per-drive password). The two options render as full-bleed cards with
// description, recommended use case, and benefits — but the actual radio
// input is preserved as an sr-only element so screen readers and tests
// can address it via its label.

import { useTranslations } from "next-intl";

export type AccessMode = "public" | "protected";

interface Props {
  value: AccessMode;
  onChange: (mode: AccessMode) => void;
  onNext: () => void;
  onBack: () => void;
}

interface OptionCardProps {
  mode: AccessMode;
  current: AccessMode;
  onChange: (mode: AccessMode) => void;
  title: string;
  description: string;
  useCase: string;
  benefits: string[];
}

function OptionCard({
  mode,
  current,
  onChange,
  title,
  description,
  useCase,
  benefits,
}: OptionCardProps): React.ReactElement {
  const selected = current === mode;
  return (
    <label
      className={`block cursor-pointer rounded-xl border p-5 transition-colors ${
        selected
          ? "border-accent bg-accent/10"
          : "border-bg-border bg-bg-card hover:bg-bg-elevated"
      }`}
    >
      <input
        type="radio"
        name="access-mode"
        checked={selected}
        onChange={() => onChange(mode)}
        className="sr-only"
        aria-label={title}
      />
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-accent bg-accent"
              : "border-warm-silver bg-bg-card"
          }`}
        >
          {selected && (
            <span className="block h-2 w-2 rounded-full bg-white" />
          )}
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
          <p className="mt-2 text-xs text-text-muted">{useCase}</p>
          <ul className="mt-2 space-y-1 text-xs text-accent-teal">
            {benefits.map((b) => (
              <li key={b}>✓ {b}</li>
            ))}
          </ul>
        </div>
      </div>
    </label>
  );
}

export function AccessModeStep({
  value,
  onChange,
  onNext,
  onBack,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tMode = useTranslations("setup.accessMode");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tMode("title")}
      </h2>
      <fieldset className="space-y-3">
        <OptionCard
          mode="public"
          current={value}
          onChange={onChange}
          title={tMode("public")}
          description={tMode("publicDescription")}
          useCase={tMode("publicUseCase")}
          benefits={[tMode("publicBenefit1"), tMode("publicBenefit2")]}
        />
        <OptionCard
          mode="protected"
          current={value}
          onChange={onChange}
          title={tMode("protected")}
          description={tMode("protectedDescription")}
          useCase={tMode("protectedUseCase")}
          benefits={[tMode("protectedBenefit1"), tMode("protectedBenefit2")]}
        />
      </fieldset>

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
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}

export default AccessModeStep;
