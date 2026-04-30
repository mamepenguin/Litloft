"use client";

// CompleteStep: final wizard screen. POSTs /api/admin/config/complete-setup,
// then navigates to /admin on success. Surfaces failures inline and leaves
// the user on this step so they can retry.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  onBack: () => void;
  onBeforeSubmit?: () => Promise<void>;
}

export function CompleteStep({
  onBack,
  onBeforeSubmit,
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">
        {tComplete("title")}
      </h2>
      <p className="text-sm text-text-muted">{tComplete("description")}</p>

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
          {t("complete")}
        </button>
      </div>
    </div>
  );
}

export default CompleteStep;
