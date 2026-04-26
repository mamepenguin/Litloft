"use client";

import { useCallback } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useProfile } from "./ProfileProvider";
import { GlobalSearch } from "./GlobalSearch";

export function Header() {
  const tp = useTranslations("profile");
  const { nickname } = useProfile();
  const router = useRouter();

  const goToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  return (
    <header className="sticky top-0 z-20 flex h-14 flex-shrink-0 items-center border-b border-bg-border bg-bg-primary px-4">
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <GlobalSearch />

        {nickname ? (
          <button
            type="button"
            onClick={goToSettings}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white transition-opacity hover:opacity-80"
            aria-label={nickname}
          >
            {nickname.charAt(0).toUpperCase()}
          </button>
        ) : (
          <button
            type="button"
            onClick={goToSettings}
            className="rounded-2xl p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label={tp("setup")}
          >
            <User size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
