"use client";

import { useState } from "react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

import { setFileTrustTier } from "@/lib/api";
import type { FileItem, TrustTier } from "@/types";

/**
 * `trust_tier` and `trust_reviewed_at` encode four states, and the control
 * differs across them: an unreviewed file is being asked a question, whereas
 * a decided one is offering a reversal. `verified` with no stamp is the
 * bulk-migrated backlog — it grounds Ask today, so it reads as trusted, but
 * it has never actually been judged.
 *
 * Withdrawing trust destroys nothing (the file stays, and anything distilled
 * from it keeps its own standing), so there is no confirmation step.
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

  // Both states carry their label: this control renders once, on the file
  // detail page, so the "label repeated across a library is noise" argument
  // for list rows does not apply.
  //
  // The badge deliberately reports the tier alone. Whether anyone has *ruled*
  // on the file is a different question; putting it here made every
  // untouched file look like a warning.
  //
  // One button rather than a chip beside an action button: state and action
  // are the same axis, so the click does the opposite of what is shown. The
  // action is the accessible name so it is never guesswork.
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
