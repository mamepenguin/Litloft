"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/Button";

export type InNameNoticeState = "failed" | "tooLarge" | "refused";

interface InNameNoticeProps {
  state: InNameNoticeState;
  onRetry?: () => void;
}

export function InNameNotice({ state, onRetry }: InNameNoticeProps) {
  const t = useTranslations("search");
  const message =
    state === "failed"
      ? t("inNameFailed")
      : state === "tooLarge"
        ? t("inNameTooLarge")
        : t("inNameRefused");
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-list-row flex-col items-center gap-3 py-10 text-center"
    >
      <p className="text-sm text-text-muted">{message}</p>
      {state === "failed" && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
