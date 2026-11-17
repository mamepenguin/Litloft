"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useEntryVisibility } from "@/hooks/useEntryVisibility";
import { useFocusLayout, useIsFilePageUrl } from "@/hooks/useFocusMode";
import { useReportPageBackground } from "@/hooks/useReportPageBackground";
import { canTakeFocusModeShortcut } from "@/lib/findShortcut";
import { focusModeStore } from "@/lib/focusModeStore";
import { restoreReadingAnchor } from "@/lib/readingAnchor";

import { ChromeButtons } from "./ChromeButtons";
import { useCurrentDrive } from "./CurrentDriveProvider";
import { FileHeaderRowProvider } from "./FileHeaderRowProvider";
import { FocusModeShortcuts } from "./FocusModeShortcuts";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useFocusSidebarWhen, useSidebar } from "./SidebarProvider";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { QuickNoteProvider } from "./quick-note";
import { GlobalSearchProvider } from "./search/GlobalSearchProvider";

/**
 * The top 8px below the safe area while the focus layout hides the header: a
 * transparent band, so a pointer reaching it reveals the header even where an
 * iframe covers the page.
 */
function FocusRevealStrip({ onReveal }: { onReveal: () => void }) {
  return (
    <div
      aria-hidden
      data-testid="focus-reveal-strip"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
      className="fixed inset-x-0 z-20 h-2"
      onPointerEnter={(event) => {
        if (event.buttons !== 0) return;
        if (!canTakeFocusModeShortcut()) return;
        onReveal();
      }}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;
  const { hidden: hiddenEntries } = useEntryVisibility(useCurrentDrive());
  useReportPageBackground();

  const focusLayout = useFocusLayout();
  const filePageUrl = useIsFilePageUrl();
  useFocusSidebarWhen(focusLayout);

  const [revealed, setRevealed] = useState(false);
  const hideFrame = useRef<number | null>(null);

  const cancelHide = useCallback(() => {
    if (hideFrame.current === null) return;
    cancelAnimationFrame(hideFrame.current);
    hideFrame.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideFrame.current = requestAnimationFrame(() => {
      hideFrame.current = null;
      setRevealed(false);
    });
  }, [cancelHide]);

  useLayoutEffect(() => {
    cancelHide();
    setRevealed(false);
  }, [focusLayout, cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  // A revealed header hides as soon as the pointer is no longer over it or
  // over the buttons beside it. Read from the element under the pointer
  // rather than from boundary events: a header that appeared under a
  // stationary pointer was never entered, so it cannot be left either.
  useEffect(() => {
    if (!focusLayout || !revealed) return;
    const header = document.querySelector("header");
    const chrome = document.querySelector('[data-testid="chrome-buttons"]');
    const holds = (x: number, y: number) => {
      const target = document.elementFromPoint(x, y);
      return !!target && (!!header?.contains(target) || !!chrome?.contains(target));
    };
    const handleMove = (event: PointerEvent) => {
      if (holds(event.clientX, event.clientY)) cancelHide();
      else scheduleHide();
    };
    const handleLeave = () => scheduleHide();
    document.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerleave", handleLeave);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerleave", handleLeave);
      cancelHide();
    };
  }, [focusLayout, revealed, cancelHide, scheduleHide]);

  // The hidden header is inert, so nothing in it may keep the keyboard.
  useLayoutEffect(() => {
    if (!focusLayout) return;
    const active = document.activeElement;
    const header = document.querySelector("header");
    if (active instanceof HTMLElement && header?.contains(active)) active.blur();
  }, [focusLayout]);

  // The state belongs to the file page it was turned on from. The layout is
  // derived from the URL, so nothing paints in between.
  useLayoutEffect(() => {
    if (!filePageUrl) focusModeStore.set(false);
  }, [filePageUrl]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (focusLayout) root.setAttribute("data-focus-layout", "");
    else root.removeAttribute("data-focus-layout");
    // One settled frame: the chrome's width and padding must not be seen
    // travelling between the two layouts, and adding the transition back is
    // itself a change the transition would animate.
    root.setAttribute("data-focus-settling", "");
    const frame = requestAnimationFrame(() =>
      root.removeAttribute("data-focus-settling"),
    );
    return () => {
      cancelAnimationFrame(frame);
      root.removeAttribute("data-focus-settling");
    };
  }, [focusLayout]);

  // A viewer whose content re-fits itself to the wider box does it over the
  // frames that follow; the restore keeps trying for those frames.
  useLayoutEffect(() => {
    restoreReadingAnchor();
  }, [focusLayout]);

  const chromeHidden = focusLayout && !revealed;

  return (
    <ShortcutsProvider>
      <QuickNoteProvider>
        <GlobalSearchProvider>
          <FileHeaderRowProvider>
            <FocusModeShortcuts active={filePageUrl} />
            <div className="min-h-dvh">
              <Sidebar hiddenKeys={hiddenEntries} />
              <ChromeButtons hidden={chromeHidden} />
              {focusLayout && !revealed && (
                <FocusRevealStrip
                  onReveal={() => {
                    cancelHide();
                    setRevealed(true);
                  }}
                />
              )}
              <div
                className={`flex min-h-dvh min-w-0 flex-col transition-[padding] duration-150 ease-out ${
                  inlineOpen && !focusLayout ? "min-[1200px]:pl-60" : ""
                }`}
                style={
                  focusLayout
                    ? { paddingTop: "env(safe-area-inset-top, 0px)" }
                    : undefined
                }
              >
                <Header focusLayout={focusLayout} hidden={chromeHidden} />
                <main className="flex min-w-0 flex-1 flex-col">{children}</main>
              </div>
            </div>
          </FileHeaderRowProvider>
        </GlobalSearchProvider>
      </QuickNoteProvider>
    </ShortcutsProvider>
  );
}
