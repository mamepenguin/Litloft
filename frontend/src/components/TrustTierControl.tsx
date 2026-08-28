"use client";

import { useState } from "react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

import { setFileTrustTier } from "@/lib/api";
import type { FileItem, TrustTier } from "@/types";

/**
 * Vouch for a file as a source, or withdraw that vouch.
 *
 * `trust_tier` and `trust_reviewed_at` encode four states, and the control
 * differs across them: an unreviewed file is being asked a question, whereas
 * a decided one is offering a reversal. `verified` with no stamp is the
 * bulk-migrated backlog — it grounds Ask today, so it reads as trusted, but
 * it has never actually been judged.
 *
 * Withdrawing trust destroys nothing (the file stays, and anything distilled
 * from it keeps its own standing), so there is no confirmation step.
 *
 * Spec `2026-08-29-web-clip-promotion.md` §3.
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
  const label = verified
    ? reviewed
      ? t("withdraw")
      : t("withdrawUnreviewed")
    : t("trust");

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
          verified
            ? "bg-bg-card text-text-primary"
            : "bg-bg-card text-text-muted"
        }`}
        data-testid="trust-tier-state"
        data-tier={file.trust_tier}
        data-reviewed={reviewed ? "true" : "false"}
      >
        {verified ? <ShieldCheck size={16} /> : <ShieldQuestion size={16} />}
        <span>
          {verified
            ? reviewed
              ? t("stateVerified")
              : t("stateUnreviewedVerified")
            : t("stateUnverified")}
        </span>
      </span>
      <button
        onClick={() => apply(target)}
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}
