"use client";

import { useCallback, useEffect, useRef } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useProfile } from "./ProfileProvider";
import { GlobalSearch } from "./GlobalSearch";
import { AddonSlot } from "./AddonSlot";
import { useCurrentDrive } from "./CurrentDriveProvider";

export function Header() {
  const tp = useTranslations("profile");
  const { nickname } = useProfile();
  const router = useRouter();
  const drive = useCurrentDrive();

  const goToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  // Publish the header's real height so anything that has to stick
  // below it can position itself without knowing its shape. The height
  // is not a constant — the PWA safe-area inset changes it, and the row
  // could wrap — so it is measured rather than mirrored.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--app-header-h",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-h");
    };
  }, []);

  return (
    <header
      ref={headerRef}
      // PWA safe-area: reserve the iOS status-bar inset above and
      // keep a stable 56px content area so the avatar / search /
      // menu button stay visually centred independently of the inset.
      //
      // The previous shape (`min-h-14 + padding-top`) measured against
      // a 56px box total: with `box-sizing: border-box` the content
      // area collapsed to (56 - inset) under PWA, then re-expanded
      // to natural content height. `items-center` then centred against
      // that drifting box and the chrome appeared subtly lower on PWA
      // than in a regular browser tab. Phase 4 review L1, hako
      // 5rtHKXzQd9VJY7WNU5Deg.
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
      }}
      className="sticky top-0 z-20 flex flex-shrink-0 items-center border-b border-bg-border bg-bg-primary px-4"
    >
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <GlobalSearch />
        {drive && (
          <AddonSlot id="header-actions" props={{ drive }} layout="stack" />
        )}

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
