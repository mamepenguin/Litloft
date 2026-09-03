"use client";

// DriveStep (Phase 2: detected drives).
//
// The backend seeds drives.json from the container mount directories on
// startup, so by the time /setup runs there are N stub drives. This step
// renders that detected list: the display name and access group are
// editable; the container path is shown read-only (the user does NOT
// type a host path here — mounts are wired by configure.py /
// docker-compose.override.yml). Next validates the whole array against
// PUT /api/admin/config/drives unless `skipValidate` is set.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

export interface DriveDraft {
  name: string;
  path: string;
  access_group: string;
}

interface Props {
  value: DriveDraft[];
  onChange: (draft: DriveDraft[]) => void;
  onNext: () => void;
  onBack: () => void;
  // When true, skip the server validation fetch on Next. The wizard sets
  // this so its async-free step transitions stay deterministic; the final
  // Complete step re-PUTs drives so we still hit validation before the
  // sentinel is touched.
  skipValidate?: boolean;
}

export function DriveStep({
  value,
  onChange,
  onNext,
  onBack,
  skipValidate = false,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tDrive = useTranslations("setup.drive");
  const [error, setError] = useState<string | null>(null);

  const hasDrives = value.length > 0;

  // Immutable per-field update: replace exactly one entry with a fresh
  // object, leaving the others (and the original array) untouched.
  const updateField = useCallback(
    (index: number, field: "name" | "access_group", next: string) => {
      onChange(
        value.map((drive, i) =>
          i === index ? { ...drive, [field]: next } : drive,
        ),
      );
    },
    [onChange, value],
  );

  const handleNext = useCallback(async () => {
    setError(null);
    if (skipValidate) {
      onNext();
      return;
    }
    try {
      const res = await fetch("/api/admin/config/drives", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) {
        let message = `Validation failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail?.message) message = body.detail.message;
          else if (body?.detail?.code) message = body.detail.code;
        } catch {
          // keep default message
        }
        setError(message);
        return;
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [onNext, skipValidate, value]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tDrive("title")}
      </h2>
      <p className="text-sm text-text-muted">
        {hasDrives ? tDrive("detectedDescription") : tDrive("description")}
      </p>

      {hasDrives ? (
        <div className="space-y-4">
          {value.map((drive, index) => (
            <div
              key={drive.path || index}
              className="space-y-3 rounded-2xl border border-bg-border bg-bg-elevated p-4"
            >
              <div className="text-xs text-text-muted">
                <span className="mr-2 font-medium text-text-primary">
                  {tDrive("pathReadonlyLabel")}
                </span>
                <code className="break-all font-mono">{drive.path}</code>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-text-primary">
                  {tDrive("fields.name")}
                </span>
                <input
                  type="text"
                  value={drive.name}
                  onChange={(e) =>
                    updateField(index, "name", e.target.value)
                  }
                  className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <p className="mt-1 text-xs text-text-muted">
                  {tDrive("helpers.name")}
                </p>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-text-primary">
                  {tDrive("fields.group")}
                </span>
                <input
                  type="text"
                  value={drive.access_group}
                  onChange={(e) =>
                    updateField(index, "access_group", e.target.value)
                  }
                  className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <p className="mt-1 text-xs text-text-muted">
                  {tDrive("helpers.group")}
                </p>
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border border-danger/40 bg-bg-elevated p-4 text-sm text-text-muted">
          <p className="font-medium text-text-primary">
            {tDrive("noneDetectedTitle")}
          </p>
          <p>{tDrive("noneDetected")}</p>
          <pre className="overflow-x-auto rounded-xl bg-bg-card p-3 text-xs">
            <code>{tDrive("noneDetectedCommand")}</code>
          </pre>
        </div>
      )}

      <details className="rounded-xl bg-bg-elevated p-4 text-sm">
        <summary className="cursor-pointer font-medium text-text-primary">
          {tDrive("troubleshootingTitle")}
        </summary>
        <div className="mt-3 space-y-2 text-text-muted">
          <p>{tDrive("troubleshooting.dockerVolume")}</p>
          <p>{tDrive("troubleshooting.containerPath")}</p>
        </div>
      </details>

      {error && <p className="text-xs text-danger">{error}</p>}

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
          onClick={handleNext}
          disabled={!hasDrives}
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sand disabled:text-warm-silver "
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}

export default DriveStep;
