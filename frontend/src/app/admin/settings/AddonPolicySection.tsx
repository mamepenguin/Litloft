"use client";

// AddonPolicySection: matrix of (drive × addon) toggles for editing
// drives.json.addons. Loads /api/admin/config/addon-policy and
// /api/addons/status, displays a checkbox grid, PUTs the full updated
// policy on every toggle change.
//
// Feature sub-toggles: when an addon's manifest declares ``policy_features``
// — e.g. intelligence ships ``{name: "transcription_cloud", default: true,
// i18n_key: "intelligence.policyFeatures.transcriptionCloud"}`` — the
// matrix renders a sub-row underneath the drive row when that addon is
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

function describeError(err: unknown, t: (key: string) => string): string {
  if (err instanceof AdminConfigError) {
    const detail = err.detail;
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
    return true;
  }
  return false;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drives = useMemo(() => Object.keys(policy), [policy]);

  const toggle = useCallback(
    async (drive: string, addon: string) => {
      const current = readToggle(policy, drive, addon);
      const driveEntry = { ...(policy[drive] ?? {}) };
      driveEntry[addon] = !current;
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

  const toggleFeature = useCallback(
    async (drive: string, addon: string, feature: AddonPolicyFeature) => {
      const current = readFeature(policy, drive, addon, feature);
      const driveEntry = { ...(policy[drive] ?? {}) };
      const existing = driveEntry[addon];
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
        // `tabindex` is what makes the right-hand columns reachable at all
        // without a pointer: a scroll region that cannot take focus cannot
        // be scrolled by keyboard, so the last addon's column is simply
        // unreachable on a narrow screen. The fade says the same thing to
        // the eye — that there is more to the right — which `overflow-x-auto`
        // alone never showed.
        <div className="relative">
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t("tableLabel")}
          >
            {/* `min-w-full`, not `w-full`. `w-full` made the table fold its
                own headings mid-word to fit the container — the scroll it
                already had was never used. `min-w-full` keeps it from
                shrinking below the container when there are few columns. */}
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap py-2 pr-6 text-left text-xs font-semibold tracking-wide text-text-muted" />
                  {addons.map((addon) => (
                    <th
                      key={addon.name}
                      className="whitespace-nowrap px-4 py-2 text-center text-sm font-medium text-text-primary"
                    >
                      {/* The display name, falling back to the identifier.
                        `label` is optional on `AddonStatusEntry` and an older
                        backend returns entries without it — `adminConfig.ts`
                        says so where it parses them. */}
                      {addon.label ?? addon.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drives.map((drive) => (
                  <Fragment key={drive}>
                    <tr className="border-t border-bg-border">
                      <td className="whitespace-nowrap py-3 pr-6 text-xs font-semibold tracking-wide text-text-muted">
                        {drive}
                      </td>
                      {addons.map((addon) => {
                        const checked = readToggle(policy, drive, addon.name);
                        return (
                          <td
                            key={addon.name}
                            className="px-4 py-3 text-center"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={`${drive} / ${addon.name}`}
                              onChange={() => toggle(drive, addon.name)}
                              className="h-4 w-4 cursor-pointer accent-accent"
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {addons.flatMap((addon) => {
                      const checked = readToggle(policy, drive, addon.name);
                      if (!checked || !addon.policy_features?.length) return [];
                      const addonIdx = addons.indexOf(addon);
                      return addon.policy_features.map((feature) => {
                        const featureChecked = readFeature(
                          policy,
                          drive,
                          addon.name,
                          feature,
                        );
                        const labelKey = `${feature.i18n_key}.label`;
                        const helpKey = `${feature.i18n_key}.help`;
                        const warningKey = `${feature.i18n_key}.warning`;
                        return (
                          <tr
                            key={`${drive}-${addon.name}-${feature.name}`}
                            data-testid={`feature-row-${drive}-${addon.name}-${feature.name}`}
                          >
                            {/* The name of the thing goes in the row-header
                              column, under the drive it belongs to; the
                              switch goes in its addon's column, centred like
                              the checkbox directly above it. Both used to sit
                              together in the addon's cell, which widened that
                              cell by the length of the description and left
                              the switch under a neighbouring column's
                              heading — the reading this layout is here to
                              fix. */}
                            <td className="py-2 pr-6 pl-4">
                              <div className="flex items-start gap-2">
                                <span
                                  className="mt-0.5 text-text-muted"
                                  aria-hidden="true"
                                >
                                  ↳
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm text-text-primary">
                                    {tRoot(labelKey)}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {tRoot(helpKey)}
                                  </p>
                                  {!featureChecked && (
                                    <p className="mt-1 text-xs text-text-muted">
                                      {tRoot(warningKey)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            {addons.map((a, idx) =>
                              idx !== addonIdx ? (
                                <td key={a.name} />
                              ) : (
                                <td
                                  key={a.name}
                                  className="px-4 py-2 text-center"
                                >
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={featureChecked}
                                    // Identifiers, not the display names above.
                                    // An accessible name has to be unique across
                                    // the page and `label` is neither required
                                    // nor guaranteed distinct, so the pair that
                                    // addresses a cell is the pair that names it.
                                    aria-label={`${drive} / ${addon.name} / ${feature.name}`}
                                    onClick={() =>
                                      toggleFeature(drive, addon.name, feature)
                                    }
                                    // Teal, not accent: this is a state, not a
                                    // call to action, and DESIGN.md §2.2 gives
                                    // state colour to teal.
                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 ${
                                      featureChecked
                                        ? "bg-accent-teal"
                                        : "bg-warm-silver/40"
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                        featureChecked
                                          ? "translate-x-6"
                                          : "translate-x-1"
                                      }`}
                                    />
                                  </button>
                                </td>
                              ),
                            )}
                          </tr>
                        );
                      });
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-primary to-transparent"
            aria-hidden
          />
        </div>
      )}

      {loaded && (drives.length === 0 || addons.length === 0) && (
        <p className="text-sm text-text-muted">—</p>
      )}
    </section>
  );
}

export default AddonPolicySection;
