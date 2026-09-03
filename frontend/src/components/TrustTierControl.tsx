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
  const action = verified ? t("withdraw") : t("trust");

  // Both states carry their label.
  //
  // Verified used to be an icon alone, on the reasoning that a label
  // repeated across a whole library is noise. That reasoning is about
  // list rows, and this control does not appear in one — it renders
  // once, on the file detail page. What the bare shield cost instead
  // was a reader having to know that a shield means verified, next to
  // an unverified state that says so in words. One of two states
  // spelling itself out is not a pair.
  //
  // The badge deliberately reports the tier alone. Whether anyone has *ruled*
  // on the file is a different question, and the one place it actually helps
  // is the "not reviewed" listing filter; putting it here made every
  // untouched file look like a warning.
  //
  // One button rather than a chip beside an action button: state and action
  // are the same axis, so the click does the opposite of what is shown, as
  // the favourite star already does in this row. The action is the accessible
  // name so it is never guesswork.
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
