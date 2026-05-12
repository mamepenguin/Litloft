import { useCallback, useEffect, useState } from "react";

const storageKey = (section: string) => `sidebar:section:${section}:collapsed`;

// Spec 2026-05-12-playlist-to-collection: copy the old "playlists" collapse
// state across once so users who collapsed Playlists keep Collections
// collapsed.
const SECTION_MIGRATIONS: Record<string, string> = {
  collections: "playlists",
};

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
      const key = storageKey(section);
      let raw = window.localStorage.getItem(key);
      const legacy = SECTION_MIGRATIONS[section];
      if (raw === null && legacy) {
        const legacyRaw = window.localStorage.getItem(storageKey(legacy));
        if (legacyRaw !== null) {
          window.localStorage.setItem(key, legacyRaw);
          window.localStorage.removeItem(storageKey(legacy));
          raw = legacyRaw;
        }
      }
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
