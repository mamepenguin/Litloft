"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { readStored, writeStored } from "@/lib/safeStorage";

const STORAGE_KEY = "sidebar-open";
export const SIDEBAR_INLINE_MIN_WIDTH = 1200;
const NARROW_QUERY = `(max-width: ${SIDEBAR_INLINE_MIN_WIDTH - 1}px)`;

interface SidebarContextValue {
  isOpen: boolean;
  isOverlay: boolean;
  toggle: () => void;
  close: () => void;
  setOverlayMode: (on: boolean) => void;
  /**
   * The focus layout takes the sidebar's place: it moves the sidebar to its
   * overlay form and closes it, and on release restores the stored
   * preference. Counted apart from `setOverlayMode` because the two must not
   * hand the place back through zero while a file page is still on screen.
   */
  setFocusLent: (on: boolean) => void;
  refreshKey: number;
  requestRefresh: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readStoredPreference(): boolean {
  const stored = readStored(STORAGE_KEY);
  return stored !== null ? stored === "true" : true;
}

function writeStoredPreference(next: boolean): void {
  writeStored(STORAGE_KEY, String(next));
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [routeOverlay, setRouteOverlay] = useState(false);
  const [focusLent, setFocusLentState] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Tracks nested useOverlaySidebar() subscriptions so overlay mode
  // only disengages when the last consumer unmounts.
  const overlayConsumersRef = useRef(0);

  const isOverlay = routeOverlay || focusLent || narrow;

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const handler = () => setNarrow(mql.matches);
    setNarrow(mql.matches);
    mql.addEventListener("change", handler);
    setHydrated(true);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // A focus-layout change closes an open overlay in either direction. Keyed on
  // the focus flag itself: `isOverlay` stays true when the sidebar is already
  // an overlay for another reason (a narrow viewport, the tree beside it), so
  // the reader's overlay would otherwise outlive the layout it was opened on.
  useLayoutEffect(() => {
    setIsOpen(false);
  }, [focusLent]);

  // When effective overlay state flips, force-close or restore the global
  // preference. Ignored during hydration so we don't clobber the first paint.
  // A layout effect, not a passive one: the focus layout ends in a commit
  // where the sidebar it closed has to be back at its stored width in the
  // frame that commit produces, and this is what puts it there.
  useLayoutEffect(() => {
    if (!hydrated) return;
    if (isOverlay) {
      setIsOpen(false);
    } else {
      setIsOpen(readStoredPreference());
    }
  }, [isOverlay, hydrated]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!isOverlay) writeStoredPreference(next);
      return next;
    });
  }, [isOverlay]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (!isOverlay) writeStoredPreference(false);
  }, [isOverlay]);

  const setOverlayMode = useCallback((on: boolean) => {
    if (on) {
      overlayConsumersRef.current += 1;
      if (overlayConsumersRef.current === 1) setRouteOverlay(true);
    } else {
      overlayConsumersRef.current = Math.max(0, overlayConsumersRef.current - 1);
      if (overlayConsumersRef.current === 0) setRouteOverlay(false);
    }
  }, []);

  const setFocusLent = useCallback((on: boolean) => {
    setFocusLentState(on);
  }, []);

  const requestRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // `children` must keep the same parent element in every render: serving
  // them bare before hydration would remount the whole page subtree when
  // the provider appears.
  return (
    <SidebarContext
      value={{
        isOpen: hydrated && isOpen,
        isOverlay: hydrated && isOverlay,
        toggle,
        close,
        setOverlayMode,
        setFocusLent,
        refreshKey,
        requestRefresh,
      }}
    >
      {children}
    </SidebarContext>
  );
}

const defaultValue: SidebarContextValue = {
  isOpen: false,
  isOverlay: false,
  toggle: () => {},
  close: () => {},
  setOverlayMode: () => {},
  setFocusLent: () => {},
  refreshKey: 0,
  requestRefresh: () => {},
};

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  return ctx ?? defaultValue;
}

/**
 * Ask the sidebar to give up its place for as long as `active` holds.
 *
 * Overlay is the right shape for "something else needs this space", not
 * `close()`: overlay stops the sidebar taking width, forces it shut,
 * restores the reader's stored preference on the way out, and — the part
 * `close()` gets wrong — leaves `localStorage` alone, so a reader who
 * keeps the sidebar open still has it open once the borrower is done.
 * The hamburger still opens it over the top meanwhile, so nothing is
 * taken away, only moved.
 *
 * Counting is in `setOverlayMode`, so two borrowers at once are fine.
 */
export function useOverlaySidebarWhen(active: boolean): void {
  const { setOverlayMode } = useSidebar();
  useEffect(() => {
    if (!active) return;
    setOverlayMode(true);
    return () => setOverlayMode(false);
  }, [active, setOverlayMode]);
}

/** The unconditional form: borrows for as long as the caller is mounted. */
export function useOverlaySidebar(): void {
  useOverlaySidebarWhen(true);
}

/**
 * The focus layout takes the sidebar's place while `active` holds: overlay
 * form, shut, stored preference untouched, and handed back on release.
 *
 * The layout phase, not an effect: the column has to be gone, and back, in
 * the frame the focus layout changes in. It does not count with
 * `setOverlayMode` because a file page releases both in one commit; the
 * count reaching zero in between would reapply the stored preference
 * mid-exit and the column would come back a frame early.
 */
export function useFocusSidebarWhen(active: boolean): void {
  const { setFocusLent } = useSidebar();
  useLayoutEffect(() => {
    setFocusLent(active);
  }, [active, setFocusLent]);
}
