"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 text-center">
      <p className="mb-1 text-sm font-medium text-text-primary">{t("pageError")}</p>
      {error.digest && (
        <p className="mb-4 font-mono text-xs text-text-muted">{error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
