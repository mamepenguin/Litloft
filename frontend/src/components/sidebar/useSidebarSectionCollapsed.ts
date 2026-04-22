import { useCallback, useEffect, useState } from "react";

const storageKey = (section: string) => `sidebar:section:${section}:collapsed`;

function persist(section: string, collapsed: boolean) {
  try {
    if (collapsed) {
      window.localStorage.setItem(storageKey(section), "1");
    } else {
      window.localStorage.removeItem(storageKey(section));
    }
  } catch {
    // ignore persistence failure
  }
}

export function useSidebarSectionCollapsed(section: string): {
  collapsed: boolean;
  toggle: () => void;
  expand: () => void;
} {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(section));
      if (raw === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable — keep default
    }
  }, [section]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persist(section, next);
      return next;
    });
  }, [section]);

  const expand = useCallback(() => {
    setCollapsed((prev) => {
      if (!prev) return prev;
      persist(section, false);
      return false;
    });
  }, [section]);

  return { collapsed, toggle, expand };
}
