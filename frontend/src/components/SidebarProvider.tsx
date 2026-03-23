"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  refreshKey: number;
  requestRefresh: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-open");
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    setIsOpen(stored !== null ? stored === "true" : isDesktop);
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-open", String(next));
      return next;
    });
  }, []);

  const close = useCallback(() => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) {
      setIsOpen(false);
      localStorage.setItem("sidebar-open", "false");
    }
  }, []);

  const requestRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!hydrated) {
    return <>{children}</>;
  }

  return (
    <SidebarContext value={{ isOpen, toggle, close, refreshKey, requestRefresh }}>
      {children}
    </SidebarContext>
  );
}

const defaultValue: SidebarContextValue = {
  isOpen: false,
  toggle: () => {},
  close: () => {},
  refreshKey: 0,
  requestRefresh: () => {},
};

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  return ctx ?? defaultValue;
}
