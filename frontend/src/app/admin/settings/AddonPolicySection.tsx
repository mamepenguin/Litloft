"use client";

// AddonPolicySection: matrix of (drive × addon) toggles for editing
// drives.json.addons. Loads /api/admin/config/addon-policy and
// /api/addons/status, displays a checkbox grid, PUTs the full updated
// policy on every toggle change.
//
// Feature sub-toggles: when an addon's manifest declares ``policy_features``
// — e.g. intelligence ships ``{name: "transcription_cloud", default: true,
// i18n_key: "intelligence.policyFeatures.transcriptionCloud"}`` — the
// matrix renders a sub-row underneath the addon column when that addon is
// enabled. Storing the flag requires the drive's addon policy value to be
// a feature dict {feature: bool} rather than a plain bool.
//
// Core treats the manifest's policy_features list as an opaque dictionary:
// it does not interpret addon names or feature names. Adding or changing
// per-feature toggles is a manifest + addon-i18n change, no core edits.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AdminConfigError,
  getAddonPolicy,
  getAddonsStatus,
  putAddonPolicy,
  type AddonPolicy,
  type AddonPolicyFeature,
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
    // For feature dicts, the addon is enabled as long as the dict exists —
    // per-feature flags live inside the dict and don't gate the addon.
    return true;
  }
  return false;
}

// Read a feature flag with default-fallback. When the policy value is a
// bool (addon-level on/off only) we fall back to the manifest-declared
// default carried in ``feature.default``.
function readFeature(
  policy: AddonPolicy,
  drive: string,
  addon: string,
  feature: AddonPolicyFeature,
): boolean {
  const driveEntry = policy[drive];
  if (!driveEntry) return feature.default;
  const value = driveEntry[addon];
  if (typeof value === "object" && value !== null) {
    if (feature.name in value) return Boolean(value[feature.name]);
  }
  return feature.default;
}

export function AddonPolicySection(): React.ReactElement {
  const t = useTranslations("settings.addonPolicy");
  // Root translator used to resolve manifest-supplied feature i18n keys
  // (e.g. ``intelligence.policyFeatures.transcriptionCloud.label``). We
  // can't pass a dynamic namespace to ``useTranslations`` so we look up
  // the full key path here.
  const tRoot = useTranslations();
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

  const toggleFeature = useCallback(
    async (drive: string, addon: string, feature: AddonPolicyFeature) => {
      const current = readFeature(policy, drive, addon, feature);
      const driveEntry = { ...(policy[drive] ?? {}) };
      const existing = driveEntry[addon];
      // Promote a bool addon entry to a feature dict so we can pin the
      // feature flag without losing the addon-level enable state.
      const featureMap: Record<string, boolean> =
        typeof existing === "object" && existing !== null
          ? { ...existing }
          : {};
      featureMap[feature.name] = !current;
      driveEntry[addon] = featureMap;
      const next: AddonPolicy = { ...policy, [drive]: driveEntry };
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
                <th className="px-3 py-2 text-left text-xs uppercase text-text-muted">
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
              {drives.map((drive) => {
                // Collect feature sub-toggles to render below the row.
                const featureRows: Array<{
                  addon: string;
                  feature: AddonPolicyFeature;
                }> = [];
                addons.forEach((addon) => {
                  if (!addon.policy_features?.length) return;
                  if (!readToggle(policy, drive, addon.name)) return;
                  addon.policy_features.forEach((feature) => {
                    featureRows.push({ addon: addon.name, feature });
                  });
                });

                return (
                  <Fragment key={drive}>
                    <tr>
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
                    {featureRows.map(({ addon, feature }) => {
                      const checked = readFeature(policy, drive, addon, feature);
                      const labelKey = `${feature.i18n_key}.label`;
                      const helpKey = `${feature.i18n_key}.help`;
                      const warningKey = `${feature.i18n_key}.warning`;
                      const ariaLabel = `${drive} / ${addon} / ${feature.name}`;
                      return (
                        <tr
                          key={`${drive}-${addon}-${feature.name}`}
                          className="bg-bg-elevated"
                          data-testid={`feature-row-${drive}-${addon}-${feature.name}`}
                        >
                          <td className="px-3 py-2 pl-8 text-xs text-text-muted">
                            <span className="mr-1" aria-hidden="true">
                              ↳
                            </span>
                            {tRoot(labelKey)}
                          </td>
                          {addons.map((a) => (
                            <td key={a.name} className="px-3 py-2">
                              {a.name === addon ? (
                                <label className="inline-flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleFeature(drive, addon, feature)
                                      }
                                      aria-label={ariaLabel}
                                    />
                                    <span className="text-xs text-text-muted">
                                      {tRoot(helpKey)}
                                    </span>
                                  </span>
                                  {!checked && (
                                    <span className="text-xs text-text-muted">
                                      {tRoot(warningKey)}
                                    </span>
                                  )}
                                </label>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AddonPolicySection;
