"use client";

// AddonPolicySection: matrix of (drive × addon) toggles for editing
// drives.json.addons. Loads /api/admin/config/addon-policy and
// /api/addons/status, displays a checkbox grid, PUTs the full updated
// policy on every toggle change.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AdminConfigError,
  getAddonPolicy,
  getAddonsStatus,
  putAddonPolicy,
  type AddonPolicy,
  type AddonStatusEntry,
} from "@/lib/adminConfig";

function describeError(
  err: unknown,
  t: (key: string) => string,
): string {
  if (err instanceof AdminConfigError) {
    const detail = err.detail;
    // Prefer the server-provided message verbatim — it carries the most
    // specific language ("manifest に存在しない addon です" etc.) and is
    // stable across i18n updates.
    if (typeof detail === "object" && detail?.message) {
      return detail.message;
    }
    const code = err.code;
    if (code) {
      const message = t(`errors.${code}`);
      if (!message.startsWith("errors.")) return message;
    }
  }
  return err instanceof Error ? err.message : t("errors.saveFailed");
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
    // For feature dicts, treat the addon as enabled when any feature is on.
    return Object.values(value).some(Boolean);
  }
  return false;
}

export function AddonPolicySection(): React.ReactElement {
  const t = useTranslations("settings.addonPolicy");
  const [policy, setPolicy] = useState<AddonPolicy>({});
  const [addons, setAddons] = useState<AddonStatusEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAddonPolicy(), getAddonsStatus()])
      .then(([pol, list]) => {
        if (cancelled) return;
        setPolicy(pol ?? {});
        setAddons(list ?? []);
        setLoadError(null);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load addon policy",
        );
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only fetch — i18n changes shouldn't re-trigger the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drives = useMemo(() => Object.keys(policy), [policy]);

  const toggle = useCallback(
    async (drive: string, addon: string) => {
      const current = readToggle(policy, drive, addon);
      const driveEntry = { ...(policy[drive] ?? {}) };
      driveEntry[addon] = !current;
      const next: AddonPolicy = { ...policy, [drive]: driveEntry };
      // Optimistic update: flip the UI immediately, revert on error.
      setPolicy(next);
      setSaveError(null);
      try {
        await putAddonPolicy(next);
      } catch (err) {
        setPolicy(policy);
        setSaveError(describeError(err, t));
      }
    },
    [policy, t],
  );

  return (
    <section className="rounded-xl border border-bg-border bg-bg-card p-4">
      <h2 className="mb-4 text-base font-semibold text-text-primary">
        {t("title")}
      </h2>

      {loadError && (
        <p className="mb-3 text-xs text-danger">{loadError}</p>
      )}
      {saveError && (
        <p className="mb-3 text-xs text-danger">{saveError}</p>
      )}

      {loaded && drives.length > 0 && addons.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-text-muted">
                  {t("drive")}
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
                <tr key={drive}>
                  <td className="px-3 py-2 text-sm font-medium text-text-primary">
                    {drive}
                  </td>
                  {addons.map((addon) => {
                    const checked = readToggle(policy, drive, addon.name);
                    return (
                      <td key={addon.name} className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(drive, addon.name)}
                            aria-label={`${drive} / ${addon.name}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AddonPolicySection;
