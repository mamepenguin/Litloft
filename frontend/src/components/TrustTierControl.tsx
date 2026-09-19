"use client";

import { useState } from "react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

import { setFileTrustTier } from "@/lib/api";
import type { FileItem, TrustTier } from "@/types";

/**
 * `verified` with no `trust_reviewed_at` is the bulk-migrated backlog: it
 * grounds Ask, so it reads as trusted, but nobody has judged it. No
 * confirmation step, because withdrawing trust destroys nothing.
 */
export function TrustTierControl({
  file,
  onChange,
}: {
  file: FileItem;
  onChange: (file: FileItem) => void;
}) {
  const t = useTranslations("trustTier");
  const [pending, setPending] = useState(false);

  const verified = file.trust_tier === "verified";
  const reviewed = file.trust_reviewed_at !== null;

  async function apply(tier: TrustTier) {
    if (pending) return;
    setPending(true);
    try {
      onChange(await setFileTrustTier(file.id, tier));
    } finally {
      setPending(false);
    }
  }

  const target: TrustTier = verified ? "unverified" : "verified";
  const action = verified ? t("withdraw") : t("trust");

  // One button: it shows the state and clicking does the opposite, so the
  // action is its accessible name.
  return (
    <button
      onClick={() => apply(target)}
      disabled={pending}
      aria-label={action}
      title={action}
      data-testid="trust-tier-state"
      data-tier={file.trust_tier}
      data-reviewed={reviewed ? "true" : "false"}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-bg-card px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
    >
      {verified ? <ShieldCheck size={16} /> : <ShieldQuestion size={16} />}
      <span>{t(verified ? "stateVerified" : "stateUnverified")}</span>
    </button>
  );
}
