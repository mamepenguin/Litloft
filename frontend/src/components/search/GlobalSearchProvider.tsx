"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type { FileKind } from "@/types";

/**
 * Supplied by whoever scopes the search; core never names what the scope is
 * for, so its label, kind and see-all destination all come from the caller.
 */
export interface SearchScope {
  label: string;
  type: FileKind;
  seeAllHref?: (query: string) => string;
}

export interface GlobalSearchOpenOptions {
  scope?: SearchScope;
}

type OpenHandler = (options?: GlobalSearchOpenOptions) => void;
type ScopeReader = () => SearchScope | null;

interface GlobalSearchContextValue {
  open: OpenHandler;
  register: (handler: OpenHandler) => () => void;
  pushScope: (read: ScopeReader) => () => void;
  defaultScope: () => SearchScope | null;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

/**
 * The modal is mounted once, in the header; this lets code anywhere under the
 * app shell open that same modal, and lets a screen say what ⌘K searches while
 * it is on screen.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<OpenHandler | null>(null);
  // A stack rather than one slot: when two registrants overlap, the one
  // leaving must not take the other's scope with it.
  const scopesRef = useRef<ScopeReader[]>([]);

  const value = useMemo<GlobalSearchContextValue>(
    () => ({
      open: (options) => handlerRef.current?.(options),
      register: (handler) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) handlerRef.current = null;
        };
      },
      pushScope: (read) => {
        scopesRef.current = [...scopesRef.current, read];
        return () => {
          scopesRef.current = scopesRef.current.filter((entry) => entry !== read);
        };
      },
      defaultScope: () => scopesRef.current.at(-1)?.() ?? null,
    }),
    [],
  );

  return (
    <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>
  );
}

/**
 * Outside a provider `open` does nothing. `open()` without a scope opens the
 * modal the way ⌘K does, in the screen's registered scope if there is one.
 */
export function useGlobalSearch(): { open: OpenHandler } {
  const ctx = useContext(GlobalSearchContext);
  return useMemo(() => ({ open: ctx?.open ?? (() => {}) }), [ctx]);
}

/** Makes `scope` what ⌘K and the header button open while the caller is mounted. */
export function useSearchScope(scope: SearchScope | null): void {
  const ctx = useContext(GlobalSearchContext);
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  const active = scope !== null;
  useEffect(() => {
    if (!ctx || !active) return;
    return ctx.pushScope(() => scopeRef.current);
  }, [ctx, active]);
}

export function useRegisterGlobalSearch(handler: OpenHandler): {
  defaultScope: () => SearchScope | null;
} {
  const ctx = useContext(GlobalSearchContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register((options) => handlerRef.current(options));
  }, [ctx]);
  return useMemo(
    () => ({ defaultScope: ctx?.defaultScope ?? (() => null) }),
    [ctx],
  );
}
