"use client";

import { useTranslations } from "next-intl";

import type { MarkdownSaveState } from "@/lib/markdownChromeContext";

/**
 * Tiny status dot. Replaces the previous "Saving... / Saved" label
 * with an 8px (`h-2 w-2`) circle so the chrome stays at 48px without
 * the busy text reflow on every keystroke.
 *
 *   idle    → transparent (aria-hidden so screen readers skip the dead pixel)
 *   saving  → accent, pulsing
 *   saved   → teal accent
 *   conflict → red
 *   error    → red (title carries the underlying error message)
 */
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
  // Idle: the dot is visually invisible and carries no useful info,
  // so we drop it from the accessibility tree entirely. Non-idle: we
  // expose it as a polite live region so AT users hear the state
  // transition without us having to manage focus.
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
