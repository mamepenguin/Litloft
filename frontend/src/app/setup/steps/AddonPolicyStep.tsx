"use client";

// AddonPolicyStep: optional first-run step. Loads the addon manifest list
// from /api/addons/status and shows per-drive cards with switch-style
// toggles (one row per addon). The drives come from props (the wizard
// owns them; they aren't persisted yet).
//
// Each toggle is rendered as a sr-only checkbox inside a clickable
// switch row to preserve the `role="checkbox"` semantics existing tests
// rely on, while presenting an iOS-style switch visually.

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
      {/* The name, and nothing under it. What the addon does is the
          same sentence on every drive's card — four drives gave four
          copies of each of the four descriptions, sixteen paragraphs
          saying four things — so it is said once, in the list above.
          Same rule as the settings table's feature legend and as
          `lib/listMeta.ts`: a line whose words do not change from row to
          row is not telling the reader which row they are on. */}
      <span className="flex-1 font-medium text-text-primary">
        {addon.name}
      </span>
    </label>
  );
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

  const hasAnyToggleOn = drives.some((d) =>
    addons.some((a) => readToggle(value, d.name, a.name)),
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tAddon("title")}
      </h2>
      <p className="text-sm text-text-muted">{tAddon("description")}</p>

      <div className="rounded-xl bg-warm-light/40 p-4 text-sm text-text-muted">
        {tAddon("skipNote")}
      </div>

      {/* What each addon is, once, before the drives it can be turned on
          for. Above the cards rather than inside them: the reader needs it
          to decide, and the decision is repeated per drive while the
          description is not.
          
          Gated on the same pair as the cards below. A list explaining
          controls that are not on the page is the "heading for a thing
          that does not exist" the redesign's first principle rejects, and
          `drives` really can be empty — the wizard starts it there and
          leaves it there when the drive probe finds nothing, which is the
          mount-guidance path.
          
          Titled, and not on `bg-bg-card` with a border. Untitled and with
          the drive cards' own surface it read as a drive card that had
          lost its name, or as a fifth drive: the same four addon names in
          the same order, one card above the real ones. */}
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
                    enabled={readToggle(value, drive.name, addon.name)}
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
          {hasAnyToggleOn ? t("next") : t("skip")}
        </button>
      </div>
    </div>
  );
}

export default AddonPolicyStep;
