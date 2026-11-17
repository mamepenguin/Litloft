"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { useEntryVisibility } from "@/hooks/useEntryVisibility";
import {
  useAnyPointer,
  useFocusLayout,
  useIsFilePageUrl,
} from "@/hooks/useFocusMode";
import { useReportPageBackground } from "@/hooks/useReportPageBackground";
import { canTakeFocusModeShortcut, isHeaderMenuOpen } from "@/lib/findShortcut";
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

/** How the header was brought back, because that decides how it leaves. */
type Reveal = "hidden" | "pointer" | "tap";

const headerElement = () => document.querySelector("header");

/**
 * The top 8px below the safe area while the focus layout hides the header: a
 * transparent band, so a pointer reaching it reveals the header even where an
 * iframe covers the page. The element is the target of the press too, so a
 * press that starts here does not land on the page under it.
 */
function FocusRevealStrip({
  onReveal,
}: {
  onReveal: (x: number, y: number) => void;
}) {
  return (
    <div
      aria-hidden
      data-testid="focus-reveal-strip"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
      className="fixed inset-x-0 z-[25] h-2"
      onPointerEnter={(event) => {
        if (event.buttons !== 0) return;
        if (!canTakeFocusModeShortcut()) return;
        onReveal(event.clientX, event.clientY);
      }}
    />
  );
}

/** The coarse pointer's way back: a pill inside a hit area large enough for a finger. */
function FocusRevealHandle({
  label,
  onReveal,
}: {
  label: string;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="focus-reveal-handle"
      aria-label={label}
      onClick={onReveal}
      style={{ top: "env(safe-area-inset-top, 0px)" }}
      className="fixed left-1/2 z-[25] flex h-11 w-[88px] -translate-x-1/2 items-center justify-center"
    >
      <span className="flex h-[22px] w-14 items-center justify-center rounded-full bg-bg-elevated text-text-muted shadow-lg">
        <ChevronDown size={14} />
      </span>
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;
  const { hidden: hiddenEntries } = useEntryVisibility(useCurrentDrive());
  useReportPageBackground();
  const tFocus = useTranslations("focusMode");

  const focusLayout = useFocusLayout();
  const filePageUrl = useIsFilePageUrl();
  useFocusSidebarWhen(focusLayout);
  const pointers = useAnyPointer();

  const [covered, setCovered] = useState(false);
  const [reveal, setReveal] = useState<Reveal>("hidden");
  // The dismissing press is still going: its pointerup and click belong to
  // the same gesture and must not land on the page it just uncovered.
  const [swallowing, setSwallowing] = useState(false);
  const revealRef = useRef<Reveal>("hidden");
  useLayoutEffect(() => {
    revealRef.current = reveal;
  }, [reveal]);

  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const hideFrame = useRef<number | null>(null);

  const cancelHide = useCallback(() => {
    if (hideFrame.current === null) return;
    cancelAnimationFrame(hideFrame.current);
    hideFrame.current = null;
  }, []);

  // Read from the element under the pointer rather than from boundary events:
  // a header that appeared under a stationary pointer was never entered, so
  // it cannot be left either.
  const pointerOverHeader = useCallback(() => {
    const at = pointerAt.current;
    if (!at) return false;
    const target = document.elementFromPoint(at.x, at.y);
    if (!target) return false;
    const header = headerElement();
    if (header?.contains(target)) return true;
    const chrome = document.querySelector('[data-testid="chrome-buttons"]');
    return !!chrome?.contains(target);
  }, []);

  const holdsReveal = useCallback(() => {
    if (isHeaderMenuOpen()) return true;
    if (isOpen && isOverlay) return true;
    const header = headerElement();
    if (!header) return false;
    if (header.contains(document.activeElement)) return true;
    if (header.querySelector("[data-needs-attention]")) return true;
    return pointerOverHeader();
  }, [isOpen, isOverlay, pointerOverHeader]);

  const holdsRef = useRef(holdsReveal);
  holdsRef.current = holdsReveal;

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideFrame.current = requestAnimationFrame(() => {
      hideFrame.current = null;
      if (!holdsRef.current()) setReveal("hidden");
    });
  }, [cancelHide]);

  // The focus layout starts hidden, and a reveal does not outlive it.
  useLayoutEffect(() => {
    cancelHide();
    setReveal("hidden");
  }, [focusLayout, cancelHide]);

  // Nothing in front of the page may reveal the header, and a cover that
  // arrives over it hides it at once. `aria-modal` has no event of its own,
  // so the surfaces that set it are watched rather than polled.
  useEffect(() => {
    if (!focusLayout) {
      setCovered(false);
      return;
    }
    const update = () => {
      const next = !canTakeFocusModeShortcut();
      setCovered(next);
      if (next) {
        cancelHide();
        setReveal("hidden");
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-modal", "data-player-fullscreen"],
      childList: true,
      subtree: true,
    });
    document.addEventListener("fullscreenchange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", update);
    };
  }, [focusLayout, cancelHide]);

  // Both reveal paths need the pointer tracked before they fire, so the hold
  // can tell whether the pointer is still on the header.
  useEffect(() => {
    if (!focusLayout) return;
    const track = (event: PointerEvent) => {
      pointerAt.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointermove", track, { passive: true });
    return () => document.removeEventListener("pointermove", track);
  }, [focusLayout]);

  // A save that needs the reader brings the header back whatever moved last;
  // it is one of the holds for as long as it lasts.
  useLayoutEffect(() => {
    if (!focusLayout || covered) return;
    const header = headerElement();
    if (!header) return;
    const check = () => {
      if (revealRef.current !== "hidden") return;
      if (header.querySelector("[data-needs-attention]")) setReveal("pointer");
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(header, {
      attributes: true,
      attributeFilter: ["data-needs-attention"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [focusLayout, covered]);

  useEffect(() => {
    if (!focusLayout || covered || reveal !== "pointer") return;
    const evaluate = () => {
      if (holdsReveal()) cancelHide();
      else scheduleHide();
    };
    const handleLeave = () => {
      pointerAt.current = null;
      scheduleHide();
    };
    document.addEventListener("pointermove", evaluate, { passive: true });
    document.addEventListener("pointerleave", handleLeave);
    document.addEventListener("focusin", evaluate);
    document.addEventListener("focusout", evaluate);
    const header = headerElement();
    let observer: MutationObserver | null = null;
    if (header) {
      observer = new MutationObserver(evaluate);
      observer.observe(header, {
        attributes: true,
        attributeFilter: ["aria-expanded", "data-needs-attention"],
        childList: true,
        subtree: true,
      });
    }
    evaluate();
    return () => {
      document.removeEventListener("pointermove", evaluate);
      document.removeEventListener("pointerleave", handleLeave);
      document.removeEventListener("focusin", evaluate);
      document.removeEventListener("focusout", evaluate);
      observer?.disconnect();
      cancelHide();
    };
  }, [focusLayout, covered, reveal, holdsReveal, cancelHide, scheduleHide]);

  // The overlay sidebar holds the reveal while it is open, and its close is
  // not a pointer event, so it is evaluated when that state moves.
  useEffect(() => {
    if (!focusLayout || reveal !== "pointer") return;
    if (holdsReveal()) cancelHide();
    else scheduleHide();
  }, [isOpen, isOverlay, focusLayout, reveal, holdsReveal, cancelHide, scheduleHide]);

  // The hidden header is inert, so nothing in it may keep the keyboard.
  useLayoutEffect(() => {
    if (!focusLayout || reveal !== "hidden") return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && headerElement()?.contains(active)) {
      active.blur();
    }
  }, [focusLayout, reveal]);

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

  const revealed = focusLayout && !covered && reveal !== "hidden";
  const chromeHidden = focusLayout && !revealed;
  const revealTargets =
    focusLayout && !covered && reveal === "hidden" && !swallowing;

  const dismissTap = useCallback(() => {
    // A menu or the overlay sidebar takes the press first and stays open;
    // the header is held by it.
    if (isHeaderMenuOpen()) return;
    if (isOpen && isOverlay) return;
    setReveal("hidden");
    setSwallowing(true);
  }, [isOpen, isOverlay]);

  return (
    <ShortcutsProvider>
      <QuickNoteProvider>
        <GlobalSearchProvider>
          <FileHeaderRowProvider>
            <FocusModeShortcuts active={filePageUrl} />
            <div className="min-h-dvh">
              <Sidebar hiddenKeys={hiddenEntries} />
              <ChromeButtons hidden={chromeHidden} />
              {revealTargets && pointers.fine && (
                <FocusRevealStrip
                  onReveal={(x, y) => {
                    pointerAt.current = { x, y };
                    cancelHide();
                    setReveal("pointer");
                  }}
                />
              )}
              {revealTargets && pointers.coarse && (
                <FocusRevealHandle
                  label={tFocus("reveal")}
                  onReveal={() => {
                    cancelHide();
                    setReveal("tap");
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
              {focusLayout && !covered && (reveal === "tap" || swallowing) && (
                // Every press outside the header is the dismiss gesture, so
                // it lands here and nowhere on the page, carrying the tap or
                // the scroll it starts with it. It stays for the rest of the
                // gesture when the header it uncovered has already gone.
                <div
                  aria-hidden
                  data-testid="focus-reveal-dismiss"
                  className="fixed inset-0 z-20 touch-none"
                  onPointerDown={dismissTap}
                  onPointerUp={() => {
                    // After the click the gesture produces, so that click
                    // lands here too.
                    window.setTimeout(() => setSwallowing(false), 0);
                  }}
                  onPointerCancel={() => setSwallowing(false)}
                  onClick={(event) => event.preventDefault()}
                />
              )}
            </div>
          </FileHeaderRowProvider>
        </GlobalSearchProvider>
      </QuickNoteProvider>
    </ShortcutsProvider>
  );
}
