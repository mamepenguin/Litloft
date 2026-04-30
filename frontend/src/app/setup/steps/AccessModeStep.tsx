"use client";

import { useTranslations } from "next-intl";

export type AccessMode = "public" | "protected";

interface Props {
  value: AccessMode;
  onChange: (mode: AccessMode) => void;
  onNext: () => void;
  onBack: () => void;
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
      <fieldset className="space-y-2">
        <label className="flex items-start gap-3 rounded-2xl border border-bg-border bg-bg-card p-3 text-sm hover:bg-bg-elevated">
          <input
            type="radio"
            name="access-mode"
            checked={value === "public"}
            onChange={() => onChange("public")}
            className="mt-1"
          />
          <span>{tMode("public")}</span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-bg-border bg-bg-card p-3 text-sm hover:bg-bg-elevated">
          <input
            type="radio"
            name="access-mode"
            checked={value === "protected"}
            onChange={() => onChange("protected")}
            className="mt-1"
          />
          <span>{tMode("protected")}</span>
        </label>
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
