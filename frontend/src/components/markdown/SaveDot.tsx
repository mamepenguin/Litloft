"use client";

import { useTranslations } from "next-intl";

import type { MarkdownSaveState } from "@/lib/markdownChromeContext";

export function SaveDot({ state }: { state: MarkdownSaveState }) {
  const t = useTranslations("inspector.saveDot");
  const isIdle = state.status === "idle";
  let toneClass = "bg-transparent";
  let labelKey = "idle";
  if (state.status === "saving") {
    toneClass = "bg-accent animate-pulse";
    labelKey = "saving";
  } else if (state.status === "saved") {
    toneClass = "bg-accent-teal";
    labelKey = "saved";
  } else if (state.status === "conflict") {
    toneClass = "bg-danger";
    labelKey = "conflict";
  } else if (state.status === "error") {
    toneClass = "bg-danger";
    labelKey = "error";
  }
  const a11yProps = isIdle
    ? ({ "aria-hidden": true } as const)
    : ({ role: "status" as const, "aria-live": "polite" as const, "aria-label": t(labelKey) });
  return (
    <span
      {...a11yProps}
      title={state.status === "error" && state.message ? state.message : t(labelKey)}
      data-testid="save-dot"
      data-state={state.status}
      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${toneClass}`}
    />
  );
}
