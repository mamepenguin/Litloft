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

import { useCallback, useEffect, useMemo, useState } from "react";
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
    <section className="rounded-xl border border-bg-border bg-bg-card p-6">
      <h2 className="mb-1 text-lg font-semibold text-text-primary">
        {t("title")}
      </h2>
      <p className="mb-6 text-sm text-text-muted">{t("description")}</p>

      {loadError && <p className="mb-4 text-xs text-danger">{loadError}</p>}
      {saveError && <p className="mb-4 text-xs text-danger">{saveError}</p>}

      {loaded && drives.length > 0 && addons.length > 0 && (
        <div className="space-y-6">
          {drives.map((drive) => (
            <div key={drive}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                {drive}
              </h3>
              <div className="space-y-2">
                {addons.map((addon) => {
                  const checked = readToggle(policy, drive, addon.name);
                  const featureRows = checked && addon.policy_features?.length
                    ? addon.policy_features
                    : [];
                  return (
                    <div
                      key={addon.name}
                      className="rounded-xl border border-bg-border bg-bg-elevated"
                    >
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-medium text-text-primary">
                          {addon.name}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          aria-label={`${drive} / ${addon.name}`}
                          onClick={() => toggle(drive, addon.name)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 ${
                            checked ? "bg-accent" : "bg-warm-silver/40"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              checked ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                      {featureRows.map((feature) => {
                        const featureChecked = readFeature(policy, drive, addon.name, feature);
                        const labelKey = `${feature.i18n_key}.label`;
                        const helpKey = `${feature.i18n_key}.help`;
                        const warningKey = `${feature.i18n_key}.warning`;
                        return (
                          <div
                            key={feature.name}
                            className="flex items-start gap-3 border-t border-bg-border px-4 py-3 pl-8"
                            data-testid={`feature-row-${drive}-${addon.name}-${feature.name}`}
                          >
                            <span className="mr-1 text-text-muted" aria-hidden="true">↳</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-text-primary">{tRoot(labelKey)}</p>
                              <p className="text-xs text-text-muted">{tRoot(helpKey)}</p>
                              {!featureChecked && (
                                <p className="mt-1 text-xs text-text-muted">{tRoot(warningKey)}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={featureChecked}
                              aria-label={`${drive} / ${addon.name} / ${feature.name}`}
                              onClick={() => toggleFeature(drive, addon.name, feature)}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 ${
                                featureChecked ? "bg-accent" : "bg-warm-silver/40"
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  featureChecked ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && (drives.length === 0 || addons.length === 0) && (
        <p className="text-sm text-text-muted">—</p>
      )}
    </section>
  );
}

export default AddonPolicySection;
