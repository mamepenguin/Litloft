"use client";

// RestartBanner: shown on /admin pages when there are pending config
// changes that require a backend restart. Reads /api/admin/config/restart-status
// on mount, renders nothing when `pending: false`. Includes a copy button
// that puts the restart command on the user's clipboard.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Copy, Check } from "lucide-react";

import { getRestartStatus, type RestartStatus } from "@/lib/adminConfig";

const RESTART_COMMAND = "docker compose restart backend";

export function RestartBanner(): React.ReactElement | null {
  const t = useTranslations("settings.restartBanner");
  const [status, setStatus] = useState<RestartStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRestartStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus({ pending: false, files: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(RESTART_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (no permission, no secure context).
      // Fail silently — the command is also visible in the UI for manual copy.
    }
  }, []);

  if (error) return null;
  if (!status || !status.pending) return null;

  return (
    <div
      role="alert"
      className="border-b border-bg-border bg-accent/10 px-4 py-3 text-sm text-text-primary"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} className="text-accent" aria-hidden="true" />
          <span>{t("title")}</span>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs text-text-muted">
          {status.files.map((file) => (
            <li
              key={file.name}
              className="rounded-full bg-bg-card px-2 py-0.5"
            >
              {typeof file.count === "number"
                ? t("fileLabel", { name: file.name, count: file.count })
                : file.name}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <code className="rounded-lg bg-bg-card px-2 py-1 text-xs">
            {RESTART_COMMAND}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-2xl bg-sand px-3 py-1 text-xs font-medium text-text-primary hover:bg-sand-hover"
          >
            {copied ? (
              <>
                <Check size={12} aria-hidden="true" />
                {t("copied")}
              </>
            ) : (
              <>
                <Copy size={12} aria-hidden="true" />
                {t("copyButton")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RestartBanner;
