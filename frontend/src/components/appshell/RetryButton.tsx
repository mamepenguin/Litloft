"use client";

import { useTranslations } from "next-intl";

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("tree");
  return (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-2xl border border-bg-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11"
    >
      {t("errorRetry")}
    </button>
  );
}
