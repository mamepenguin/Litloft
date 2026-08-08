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
      {/* TEMPORARY (diagnosis): the message and the first frames of the
          stack, because a phone has no console to read them from.
          Remove once the player-UI switch crash is understood. */}
      <pre className="mb-4 max-h-48 w-full max-w-md overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg-elevated p-2 text-left font-mono text-[11px] text-text-muted">
        {error.message}
        {error.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
      </pre>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
