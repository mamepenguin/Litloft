"use client";

// CompleteStep: final wizard screen. Renders an input summary card and
// a "next steps" list, then POSTs /api/admin/config/complete-setup and
// navigates to /admin on success. Surfaces failures inline and leaves
// the user on this step so they can retry.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export interface CompleteSummary {
  driveCount: number;
  accessMode: "public" | "protected";
  addonOnCount: number;
}

interface Props {
  onBack: () => void;
  onBeforeSubmit?: () => Promise<void>;
  summary: CompleteSummary;
}

export function CompleteStep({
  onBack,
  onBeforeSubmit,
  summary,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  const tComplete = useTranslations("setup.complete");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (onBeforeSubmit) await onBeforeSubmit();
      const res = await fetch("/api/admin/config/complete-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        let message = tComplete("errorMessage");
        try {
          const body = await res.json();
          if (body?.detail?.message) message = body.detail.message;
        } catch {
          // keep default message
        }
        setError(message);
        return;
      }
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : tComplete("errorMessage"));
    } finally {
      setSubmitting(false);
    }
  }, [onBeforeSubmit, router, tComplete]);

  const accessModeLabel =
    summary.accessMode === "public"
      ? tComplete("summary.public")
      : tComplete("summary.protected");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {tComplete("title")}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {tComplete("description")}
        </p>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          {tComplete("summary.title")}
        </h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">{tComplete("summary.drives")}</dt>
            <dd className="font-medium text-text-primary">
              {summary.driveCount}
              {tComplete("summary.driveUnit")}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">
              {tComplete("summary.accessMode")}
            </dt>
            <dd className="font-medium text-text-primary">
              {accessModeLabel}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">{tComplete("summary.addons")}</dt>
            <dd className="font-medium text-text-primary">
              {summary.addonOnCount}
              {tComplete("summary.addonUnit")}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl bg-bg-elevated p-5">
        <h3 className="text-sm font-semibold text-text-primary">
          {tComplete("nextSteps.title")}
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-text-muted">
          <li>{tComplete("nextSteps.save")}</li>
          <li>{tComplete("nextSteps.redirect")}</li>
          <li>{tComplete("nextSteps.lan")}</li>
        </ol>
      </div>

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
          onClick={handleComplete}
          disabled={submitting}
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? tComplete("submitting") : t("complete")}
        </button>
      </div>
    </div>
  );
}

export default CompleteStep;
