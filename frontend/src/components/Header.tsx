"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
import { readSafeAreaTop } from "@/lib/safeArea";

interface HeaderProps {
  /** The focus layout is on, so the header is either hidden or drawn over the page. */
  focusLayout?: boolean;
  /** Hidden: no box, no paint, and out of the tab order. */
  hidden?: boolean;
}

export function Header({ focusLayout = false, hidden = false }: HeaderProps = {}) {
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
  // could wrap — so it is measured rather than mirrored. The focus layout
  // removes the header from the page, so there what everything below has
  // to clear is only the inset.
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--app-header-h",
        `${focusLayout ? readSafeAreaTop() : el.getBoundingClientRect().height}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-h");
    };
  }, [focusLayout]);

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
  const hideHeaderControls = narrowFileRow && !!rowNeeds?.hideHeaderControls;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowInset, setRowInset] = useState(0);

  const attachRow = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      setRowContainer?.(node);
    },
    [setRowContainer],
  );

  const setTrailingContainer = rowHost?.setTrailingContainer;
  const attachTrailing = useCallback(
    (node: HTMLDivElement | null) => {
      setTrailingContainer?.(node);
    },
    [setTrailingContainer],
  );

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !filePageRow || hidden) {
      setRowInset(0);
      return;
    }
    const measure = () => {
      const frame = row.getBoundingClientRect();
      // At least 16px inside the content's box, as the header's controls
      // keep from its right end (`pr-4`): the canonical route's right pane
      // has no padding, so its edge is the tree's or the sidebar's border.
      const content = align
        ? align.getBoundingClientRect().left +
          Math.max(16, Number.parseFloat(getComputedStyle(align).paddingLeft) || 0)
        : 0;
      const wanted = Math.max(
        chromeButtons ? chromeButtons.getBoundingClientRect().right + 12 : 0,
        content,
      );
      setRowInset(Math.max(16, wanted - frame.left));
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
  }, [align, chromeButtons, filePageRow, focusLayout, hidden]);

  return (
    <header
      ref={headerRef}
      // `data-focus-header` carries the focus layout's two forms: the
      // ordinary header keeps the class list this element has always had.
      data-focus-header={
        focusLayout ? (hidden ? "hidden" : "revealed") : undefined
      }
      inert={hidden}
      // PWA safe-area: reserve the iOS status-bar inset above and
      // keep a stable 56px content area so the avatar / search /
      // menu button stay visually centred independently of the inset.
      // Drawn over the page it starts at the inset instead, so it does
      // not carry it twice.
      style={
        focusLayout && !hidden
          ? { minHeight: "3.5rem" }
          : {
              paddingTop: "env(safe-area-inset-top, 0px)",
              minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
            }
      }
      className="sticky top-0 z-20 flex flex-shrink-0 items-center border-b border-bg-border bg-bg-primary"
    >
      <div
        ref={attachRow}
        data-testid="file-header-row"
        style={rowInset > 0 ? { paddingLeft: rowInset } : undefined}
        className="flex min-w-0 flex-1 items-center"
      />

      <div className="flex items-center gap-1 pr-4">
        {!hideHeaderControls && <GlobalSearch />}
        {/* Mounted directly, not through the addon slot: Quick Note has to be
            reachable from root, admin, and settings screens too, and those
            have no active drive. */}
        {!narrowFileRow && <QuickNote />}
        {drive && (
          // Hidden rather than unmounted: a slot entry may draw nothing and
          // still announce results while the row needs the space.
          <div className={hideHeaderControls ? "hidden" : "contents"}>
            <AddonSlot id="header-actions" props={{ drive }} layout="stack" />
          </div>
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
        {/* `contents` while empty: a page with no inspector must not gain a
            flex gap or a box where its last control used to end. */}
        <div
          ref={attachTrailing}
          data-testid="header-trailing"
          className="contents"
        />
      </div>
    </header>
  );
}
