"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";

import {
  AdminConfigError,
  getAddonPolicy,
  getAddonsStatus,
  isAddonFeatureOn,
  isAddonOn,
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

/**
 * A paragraph whose words do not change from row to row is not telling the
 * reader which row they are on.
 */
interface LegendEntry {
  key: string;
  addonLabel: string;
  i18nKey: string;
  offAnywhere: boolean;
}

function legendEntries(
  policy: AddonPolicy,
  addons: AddonStatusEntry[],
  drives: string[],
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  for (const addon of addons) {
    for (const feature of addon.policy_features ?? []) {
      const shown = drives.filter((drive) =>
        isAddonOn(policy, drive, addon.name),
      );
      if (shown.length === 0) continue;
      entries.push({
        key: `${addon.name}-${feature.name}`,
        addonLabel: addon.label ?? addon.name,
        i18nKey: feature.i18n_key,
        offAnywhere: shown.some(
          (drive) => !isAddonFeatureOn(policy, drive, addon.name, feature.name),
        ),
      });
    }
  }
  return entries;
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

  const legend = useMemo(
    () => legendEntries(policy, addons, drives),
    [policy, addons, drives],
  );

  const toggle = useCallback(
    async (drive: string, addon: string) => {
      const current = isAddonOn(policy, drive, addon);
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
      const current = isAddonFeatureOn(policy, drive, addon, feature.name);
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

  /**
   * The fade says "there is more to the right", so it has to be false when
   * there is not.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [drives, addons]);

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
        // be scrolled by keyboard.
        <div className="relative">
          <div
            ref={scrollRef}
            // Bounded, and that is what makes the column headings stick.
            // `position: sticky` resolves against the nearest scrollport,
            // and `overflow-x: auto` already made this element one in both
            // axes.
            className="max-h-[70vh] overflow-x-auto overflow-y-auto"
            tabIndex={0}
            role="region"
            aria-label={t("tableLabel")}
          >
            {/* `min-w-full`, not `w-full`: `w-full` makes the table fold its
                own headings mid-word to fit the container. */}
            <table className="min-w-full border-collapse text-sm">
              {/* `sticky top-0` on the cells, not on the row: a `<tr>` is
                  not a positioned box in most engines, so the offset has to
                  go on the `<th>`s. They need their own background too —
                  a sticky head over transparent cells shows the rows
                  travelling underneath it. */}
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-bg-card py-2 pr-6 text-left text-xs font-semibold tracking-wide text-text-muted" />
                  {addons.map((addon) => (
                    <th
                      key={addon.name}
                      className="sticky top-0 z-10 whitespace-nowrap bg-bg-card px-4 py-2 text-center text-sm font-medium text-text-primary"
                    >
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
                        const checked = isAddonOn(policy, drive, addon.name);
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
                      const checked = isAddonOn(policy, drive, addon.name);
                      if (!checked || !addon.policy_features?.length) return [];
                      const addonIdx = addons.indexOf(addon);
                      return addon.policy_features.map((feature) => {
                        const featureChecked = isAddonFeatureOn(policy, drive, addon.name, feature.name);
                        const labelKey = `${feature.i18n_key}.label`;
                        return (
                          <tr
                            key={`${drive}-${addon.name}-${feature.name}`}
                            data-testid={`feature-row-${drive}-${addon.name}-${feature.name}`}
                          >
                            <td className="whitespace-nowrap py-2 pr-6 pl-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-text-muted"
                                  aria-hidden="true"
                                >
                                  ↳
                                </span>
                                <span className="text-sm text-text-primary">
                                  {tRoot(labelKey)}
                                </span>
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
          {overflows && (
            <div
              // `from-bg-card`, the surface this actually sits on. Both
              // tokens are `#ffffff` in the light theme, so the wrong one
              // shows up only in dark.
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-card to-transparent"
              aria-hidden
            />
          )}
        </div>
      )}

      {loaded && legend.length > 0 && (
        <dl className="mt-6 space-y-4 border-t border-bg-border pt-4">
          {legend.map((entry) => (
            <div key={entry.key}>
              <dt className="text-sm text-text-primary">
                <span className="text-text-muted">{entry.addonLabel}</span>{" "}
                {tRoot(`${entry.i18nKey}.label`)}
              </dt>
              <dd className="mt-0.5 text-xs text-text-muted">
                {tRoot(`${entry.i18nKey}.help`)}
              </dd>
              {entry.offAnywhere && (
                <dd className="mt-1 text-xs text-text-muted">
                  {tRoot(`${entry.i18nKey}.warning`)}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}

      {loaded && (drives.length === 0 || addons.length === 0) && (
        <p className="text-sm text-text-muted">—</p>
      )}
    </section>
  );
}

export default AddonPolicySection;
