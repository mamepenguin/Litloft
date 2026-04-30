"use client";

// SetupShell: outer chrome for the first-run wizard. Provides the warm
// canvas gradient background, a brand header, and a centered content
// container. Children render the active step (and optionally the
// Stepper) without re-implementing the layout each time.

import { useTranslations } from "next-intl";

interface Props {
  showHeaderSubtitle?: boolean;
  children: React.ReactNode;
}

export function SetupShell({
  showHeaderSubtitle = true,
  children,
}: Props): React.ReactElement {
  const t = useTranslations("setup");
  return (
    <div className="min-h-screen bg-gradient-to-b from-bg-primary to-bg-elevated">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-8 pb-4 sm:px-6">
        <span className="text-2xl font-bold text-accent">Litloft</span>
        {showHeaderSubtitle && (
          <>
            <span className="text-text-muted" aria-hidden="true">
              |
            </span>
            <span className="text-sm text-text-muted">{t("subtitle")}</span>
          </>
        )}
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">{children}</main>
    </div>
  );
}

export default SetupShell;
