"use client";

// AddonPolicyStep: optional first-run step. Loads the addon manifest list
// from /api/addons/status and shows a (drive × addon) toggle matrix. The
// drives come from props (the wizard owns them; they aren't persisted yet).

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { DriveDraft } from "./DriveStep";
import type { AddonStatusEntry, AddonPolicy } from "@/lib/adminConfig";

interface Props {
  drives: DriveDraft[];
  value: AddonPolicy;
  onChange: (policy: AddonPolicy) => void;
  onNext: () => void;
  onBack: () => void;
}

function readToggle(
  policy: AddonPolicy,
  drive: string,
  addon: string,
): boolean {
  const driveEntry = policy[drive];
  if (!driveEntry) return false;
  const value = driveEntry[addon];
  if (typeof value === "boolean") return value;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(Boolean);
  }
  return false;
}

export function AddonPolicyStep({
  drives,
  value,
  onChange,
  onNext,
  onBack,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tAddon = useTranslations("setup.addonPolicy");
  const [addons, setAddons] = useState<AddonStatusEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/addons/status", { credentials: "include" })
      .then(async (res): Promise<AddonStatusEntry[]> => {
        if (!res.ok) return [];
        // Backend returns {addons: {[name]: meta}, slots: {...}}; tolerate
        // the legacy array shape too so tests / older deployments work.
        const data = (await res.json()) as
          | { addons?: Record<string, Omit<AddonStatusEntry, "name">> }
          | AddonStatusEntry[];
        if (Array.isArray(data)) return data;
        const addons = data?.addons ?? {};
        return Object.entries(addons).map(([name, meta]) => ({
          name,
          ...meta,
        }));
      })
      .then((list) => {
        if (!cancelled) setAddons(list);
      })
      .catch(() => {
        // Manifest list is optional; render an empty matrix when it fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    (drive: string, addon: string) => {
      const current = readToggle(value, drive, addon);
      const driveEntry = { ...(value[drive] ?? {}) };
      driveEntry[addon] = !current;
      onChange({ ...value, [drive]: driveEntry });
    },
    [onChange, value],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tAddon("title")}
      </h2>
      <p className="text-sm text-text-muted">{tAddon("description")}</p>

      {drives.length > 0 && addons.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-text-muted">
                  drive
                </th>
                {addons.map((addon) => (
                  <th
                    key={addon.name}
                    className="px-3 py-2 text-left text-xs font-semibold text-text-primary"
                  >
                    {addon.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drives.map((drive) => (
                <tr key={drive.name}>
                  <td className="px-3 py-2 text-sm font-medium text-text-primary">
                    {drive.name}
                  </td>
                  {addons.map((addon) => (
                    <td key={addon.name} className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={readToggle(value, drive.name, addon.name)}
                        onChange={() => toggle(drive.name, addon.name)}
                        aria-label={`${drive.name} / ${addon.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
          {t("skip")}
        </button>
      </div>
    </div>
  );
}

export default AddonPolicyStep;
