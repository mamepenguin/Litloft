"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import type { DriveDraft } from "./DriveStep";
import { isAddonOn, type AddonStatusEntry, type AddonPolicy } from "@/lib/adminConfig";

interface Props {
  drives: DriveDraft[];
  addons: AddonStatusEntry[];
  value: AddonPolicy;
  onChange: (policy: AddonPolicy) => void;
  onNext: () => void;
  onBack: () => void;
}

interface AddonRowProps {
  drive: string;
  addon: AddonStatusEntry;
  enabled: boolean;
  onToggle: () => void;
}

function AddonRow({
  drive,
  addon,
  enabled,
  onToggle,
}: AddonRowProps): React.ReactElement {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-bg-elevated">
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        className="sr-only"
        aria-label={`${drive} / ${addon.name}`}
      />
      <span
        aria-hidden="true"
        className={`relative mt-1 inline-block h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          enabled ? "bg-accent" : "bg-warm-light"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      {/* What the addon does is the same sentence on every drive's card,
          so it is said once, in the list above. */}
      <span className="flex-1 font-medium text-text-primary">
        {addon.name}
      </span>
    </label>
  );
}

export function AddonPolicyStep({
  drives,
  addons,
  value,
  onChange,
  onNext,
  onBack,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tAddon = useTranslations("setup.addonPolicy");
  const toggle = useCallback(
    (drive: string, addon: string) => {
      const current = isAddonOn(value, drive, addon);
      const driveEntry = { ...(value[drive] ?? {}) };
      driveEntry[addon] = !current;
      onChange({ ...value, [drive]: driveEntry });
    },
    [onChange, value],
  );

  const storesAnything = drives.some((d) => value[d.name] !== undefined);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tAddon("title")}
      </h2>
      <p className="text-sm text-text-muted">{tAddon("description")}</p>

      <div className="rounded-xl bg-warm-light/40 p-4 text-sm text-text-muted">
        {tAddon("skipNote")}
      </div>

      {drives.length > 0 && addons.length > 0 && (
        <section className="rounded-xl bg-warm-light/30 p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-muted">
            {tAddon("legendTitle")}
          </h3>
          <dl className="space-y-3">
            {addons.map((addon) => (
              <div key={addon.name}>
                <dt className="font-medium text-text-primary">{addon.name}</dt>
                <dd className="text-xs text-text-muted">
                  {addon.description ?? tAddon("noDescription")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {drives.length > 0 && addons.length > 0 ? (
        <div className="space-y-4">
          {drives.map((drive) => (
            <div
              key={drive.name}
              className="rounded-xl border border-bg-border bg-bg-card p-5"
            >
              <h3 className="font-semibold text-text-primary">
                {drive.name}
              </h3>
              <div className="mt-3 space-y-1">
                {addons.map((addon) => (
                  <AddonRow
                    key={addon.name}
                    drive={drive.name}
                    addon={addon}
                    enabled={isAddonOn(value, drive.name, addon.name)}
                    onToggle={() => toggle(drive.name, addon.name)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">{tAddon("skipDescription")}</p>
      )}

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
          {storesAnything ? t("next") : t("skip")}
        </button>
      </div>
    </div>
  );
}

export default AddonPolicyStep;
