"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useProfile } from "./ProfileProvider";
import { GlobalSearch } from "./GlobalSearch";
import { QuickNote } from "./quick-note";
import { AddonSlot } from "./AddonSlot";
import { useCurrentDrive } from "./CurrentDriveProvider";
import { useFileHeaderRowHost } from "./FileHeaderRowProvider";
import { useIsMobile } from "@/hooks/useIsMobile";

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

  // The file page's row starts at whichever is further right: 12px past
  // the fixed menu/tree buttons, or the box the file's content occupies.
  // Both are measured live because the tree pane animates its width and
  // the sidebar moves the whole frame when it opens.
  const rowHost = useFileHeaderRowHost();
  const setRowContainer = rowHost?.setContainer;
  const align = rowHost?.align ?? null;
  const chromeButtons = rowHost?.chromeButtons ?? null;
  const filePageRow = !!rowHost?.top;
  const isMobile = useIsMobile();
  // A phone's file page is the file's own screen: the quick note button and
  // the profile avatar are on every other screen, and the row's own content
  // can need the search button's room too.
  const narrowFileRow = filePageRow && isMobile;
  const rowNeeds = rowHost && rowHost.top ? rowHost.rowNeeds[rowHost.top] : undefined;
  const hideSearch = narrowFileRow && !!rowNeeds?.hideSearch;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowInset, setRowInset] = useState(0);

  const attachRow = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      setRowContainer?.(node);
    },
    [setRowContainer],
  );

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !filePageRow) {
      setRowInset(0);
      return;
    }
    const measure = () => {
      const frame = row.getBoundingClientRect();
      const content = align
        ? align.getBoundingClientRect().left +
          (Number.parseFloat(getComputedStyle(align).paddingLeft) || 0)
        : 0;
      const wanted = Math.max(
        chromeButtons ? chromeButtons.getBoundingClientRect().right + 12 : 0,
        content,
      );
      setRowInset(Math.max(0, wanted - frame.left));
    };
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(row);
      if (chromeButtons) observer.observe(chromeButtons);
      if (align) observer.observe(align);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [align, chromeButtons, filePageRow]);

  return (
    <header
      ref={headerRef}
      // PWA safe-area: reserve the iOS status-bar inset above and
      // keep a stable 56px content area so the avatar / search /
      // menu button stay visually centred independently of the inset.
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
      }}
      className="sticky top-0 z-20 flex flex-shrink-0 items-center border-b border-bg-border bg-bg-primary"
    >
      <div
        ref={attachRow}
        data-testid="file-header-row"
        style={rowInset > 0 ? { paddingLeft: rowInset } : undefined}
        className="flex min-w-0 flex-1 items-center"
      />

      <div className="flex items-center gap-1 pr-4">
        {!hideSearch && <GlobalSearch />}
        {/* Mounted directly, not through the addon slot: Quick Note has to be
            reachable from root, admin, and settings screens too, and those
            have no active drive. */}
        {!narrowFileRow && <QuickNote />}
        {drive && (
          <AddonSlot id="header-actions" props={{ drive }} layout="stack" />
        )}

        {!narrowFileRow &&
          (nickname ? (
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
          ))}
      </div>
    </header>
  );
}
