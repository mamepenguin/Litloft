"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * The app header's one row, which a file page draws its own content into.
 *
 * The content is portalled rather than lifted, so it stays a descendant of
 * the page in React's tree: find, the image arrows, the Inbox actions and a
 * note's editor all reach the page that drew them through their own context,
 * which a portal preserves and a child rendered by the header would not.
 *
 * Drawers overlap while one file page replaces another, so the most recently
 * mounted one is the one drawn. A file page must never fall back to the
 * header's ordinary form in the middle of such a swap.
 */
/**
 * What a narrow file page's row needs from the header's own controls: the
 * row can grow into space the header gives up, but only the card's owner
 * knows whether it needs it.
 */
export interface FileRowNeeds {
  hideHeaderControls: boolean;
}

interface FileHeaderRowValue {
  container: HTMLElement | null;
  top: string | null;
  /** The box the top drawer's content starts at, or null where the header is the whole frame. */
  align: HTMLElement | null;
  /** The fixed menu and tree buttons, whose right edge the trail starts past. */
  chromeButtons: HTMLElement | null;
  /** Keyed by drawer, so a drawer that is no longer on top leaves nothing behind. */
  rowNeeds: Record<string, FileRowNeeds>;
  register: (id: string) => () => void;
  alignTo: (id: string, element: HTMLElement | null) => void;
  setContainer: (element: HTMLElement | null) => void;
  setChromeButtons: (element: HTMLElement | null) => void;
  setRowNeeds: (id: string, needs: FileRowNeeds | null) => void;
}

const FileHeaderRowContext = createContext<FileHeaderRowValue | null>(null);

const FileRowAlignContext = createContext<HTMLElement | null>(null);

export function FileHeaderRowProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [drawers, setDrawers] = useState<string[]>([]);
  const [aligned, setAligned] = useState<{
    id: string;
    element: HTMLElement | null;
  } | null>(null);
  const [chromeButtons, setChromeButtons] = useState<HTMLElement | null>(null);
  const [rowNeeds, setRowNeedsState] = useState<Record<string, FileRowNeeds>>(
    {},
  );

  const setRowNeeds = useCallback(
    (id: string, needs: FileRowNeeds | null) => {
      setRowNeedsState((prev) => {
        if (needs === null) {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: needs };
      });
    },
    [],
  );

  const register = useCallback((id: string) => {
    setDrawers((prev) => (prev.includes(id) ? prev : [...prev, id]));
    return () =>
      setDrawers((prev) =>
        prev.includes(id) ? prev.filter((entry) => entry !== id) : prev,
      );
  }, []);

  const alignTo = useCallback((id: string, element: HTMLElement | null) => {
    setAligned((prev) =>
      prev && prev.id === id && prev.element === element
        ? prev
        : { id, element },
    );
  }, []);

  const top = drawers.length > 0 ? drawers[drawers.length - 1] : null;
  const value = useMemo(
    () => ({
      container,
      top,
      align: aligned && aligned.id === top ? aligned.element : null,
      chromeButtons,
      rowNeeds,
      register,
      alignTo,
      setContainer,
      setChromeButtons,
      setRowNeeds,
    }),
    [container, top, aligned, chromeButtons, rowNeeds, register, alignTo, setRowNeeds],
  );

  return (
    <FileHeaderRowContext.Provider value={value}>
      {children}
    </FileHeaderRowContext.Provider>
  );
}

/** The header and the fixed toolbar buttons read the slot they share. */
export function useFileHeaderRowHost(): FileHeaderRowValue | null {
  return useContext(FileHeaderRowContext);
}

/**
 * Declares the box the trail starts at, for the drawer inside it. Without a
 * host the row falls back to the in-flow bar, which needs no alignment.
 */
export function FileRowAlignProvider({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <FileRowAlignContext.Provider value={element}>
      {children}
    </FileRowAlignContext.Provider>
  );
}

/**
 * Draws its children into the header's row while this is the newest mounted
 * page; `null` before the header exists, so a page outside the shell keeps
 * the row it draws itself.
 */
export function FileHeaderRowPortal({
  children,
  needs,
}: {
  children: ReactNode;
  needs?: FileRowNeeds;
}) {
  const host = useContext(FileHeaderRowContext);
  const id = useId();
  const register = host?.register;
  useLayoutEffect(() => {
    if (!register) return;
    return register(id);
  }, [register, id]);

  const alignElement = useContext(FileRowAlignContext);
  const top = host?.top === id;
  const alignTo = host?.alignTo;
  useLayoutEffect(() => {
    if (!top || !alignTo) return;
    alignTo(id, alignElement);
  }, [alignTo, alignElement, id, top]);

  const setRowNeeds = host?.setRowNeeds;
  const hideHeaderControls = needs?.hideHeaderControls ?? false;
  useLayoutEffect(() => {
    if (!top || !setRowNeeds) return;
    setRowNeeds(id, { hideHeaderControls });
    return () => setRowNeeds(id, null);
  }, [top, setRowNeeds, id, hideHeaderControls]);

  if (!host || !top || !host.container) return null;
  return createPortal(children, host.container);
}
