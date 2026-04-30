"use client";

// PasswordStep: collects the master password. The master entry must
// cover every group present in the setup, so we render a checkbox per
// group and disable Next while any group is unchecked.

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
          className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
      </label>

      <fieldset className="space-y-1">
        <legend className="mb-1 block text-sm font-medium text-text-primary">
          {tPw("fields.groups")}
        </legend>
        {groups.map((group) => (
          <label key={group} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.groups.includes(group)}
              onChange={() => toggleGroup(group)}
            />
            <span>{group}</span>
          </label>
        ))}
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
