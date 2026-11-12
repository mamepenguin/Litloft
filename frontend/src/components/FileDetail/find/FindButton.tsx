"use client";

import { useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";

import { useFind } from "./FindContext";

export function FindButton() {
  const t = useTranslations("find");
  const find = useFind();
  return (
    <button
      type="button"
      onClick={find.openFind}
      aria-label={t("button")}
      title={t("button")}
      data-testid="find-button"
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
    >
      <FileSearch size={16} />
    </button>
  );
}
