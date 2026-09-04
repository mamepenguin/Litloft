"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const [narrow, setNarrow] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Tracks nested useOverlaySidebar() subscriptions so overlay mode
  // only disengages when the last consumer unmounts.
  const overlayConsumersRef = useRef(0);

  const isOverlay = routeOverlay || narrow;

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const handler = () => setNarrow(mql.matches);
    setNarrow(mql.matches);
    mql.addEventListener("change", handler);
    setHydrated(true);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // When effective overlay state flips, force-close or restore the global
  // preference. Ignored during hydration so we don't clobber the first paint.
  useEffect(() => {
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

  const requestRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!hydrated) {
    return <>{children}</>;
  }

  return (
    <SidebarContext
      value={{
        isOpen,
        isOverlay,
        toggle,
        close,
        setOverlayMode,
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
  refreshKey: 0,
  requestRefresh: () => {},
};

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  return ctx ?? defaultValue;
}

export function useOverlaySidebar(): void {
  const { setOverlayMode } = useSidebar();
  useEffect(() => {
    setOverlayMode(true);
    return () => setOverlayMode(false);
  }, [setOverlayMode]);
}
