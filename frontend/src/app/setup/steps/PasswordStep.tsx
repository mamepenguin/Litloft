"use client";

// PasswordStep: collects the master password. The master entry must
// cover every group present in the setup, so we render a chip per
// group (visually a tonal pill, structurally a checkbox label) and
// disable Next while any group is unchecked. A short admin-authorisation
// explainer above the input clarifies *why* every group must be
// covered.

import { useTranslations } from "next-intl";

export interface PasswordDraft {
  password: string;
  groups: string[];
}

interface Props {
  groups: string[];
  value: PasswordDraft;
  onChange: (draft: PasswordDraft) => void;
  onNext: () => void;
  onBack: () => void;
}

const WEAK_PASSWORD_THRESHOLD = 6;

export function PasswordStep({
  groups,
  value,
  onChange,
  onNext,
  onBack,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tPw = useTranslations("setup.password");

  const allCovered =
    groups.length > 0 &&
    groups.every((g) => value.groups.includes(g));
  const isValid = value.password.trim().length > 0 && allCovered;
  const showWeakHint =
    value.password.length > 0 &&
    value.password.length < WEAK_PASSWORD_THRESHOLD;

  const toggleGroup = (group: string) => {
    if (value.groups.includes(group)) {
      onChange({
        ...value,
        groups: value.groups.filter((g) => g !== group),
      });
    } else {
      onChange({ ...value, groups: [...value.groups, group] });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tPw("title")}
      </h2>
      <p className="text-sm text-text-muted">{tPw("description")}</p>

      <div className="rounded-xl bg-bg-elevated p-4 text-sm text-text-muted">
        {tPw("adminExplanation")}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-text-primary">
          {tPw("fields.password")}
        </span>
        <input
          type="password"
          value={value.password}
          onChange={(e) =>
            onChange({ ...value, password: e.target.value })
          }
          autoComplete="new-password"
          className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        {showWeakHint && (
          <p className="mt-1 text-xs text-accent-amber">
            {tPw("weakPassword")}
          </p>
        )}
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 block text-sm font-medium text-text-primary">
          {tPw("fields.groups")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const checked = value.groups.includes(group);
            return (
              <label
                key={group}
                className={`inline-flex cursor-pointer items-center rounded-full px-3 py-1.5 text-sm transition-colors ${
                  checked
                    ? "bg-accent-teal/10 text-accent-teal"
                    : "bg-warm-light text-text-muted hover:bg-sand"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleGroup(group)}
                  aria-label={group}
                />
                <span aria-hidden="true">
                  {checked ? "✓ " : ""}
                  {group}
                </span>
              </label>
            );
          })}
        </div>
        {!allCovered && (
          <p className="text-xs text-danger">{tPw("groupsRequired")}</p>
        )}
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
          disabled={!isValid}
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}

export default PasswordStep;
