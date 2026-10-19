"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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

type OpenHandler = () => void;

interface ScopeEntry {
  token: symbol;
  scope: SearchScope;
}

interface GlobalSearchActions {
  open: OpenHandler;
  register: (handler: OpenHandler) => () => void;
  pushScope: (entry: ScopeEntry) => () => void;
  updateScope: (entry: ScopeEntry) => void;
}

const ActionsContext = createContext<GlobalSearchActions | null>(null);
const ActiveScopeContext = createContext<SearchScope | null>(null);

/**
 * The modal is mounted once, in the header; this lets code anywhere under the
 * app shell open that same modal, and lets a screen say what it searches while
 * the screen is mounted.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<OpenHandler | null>(null);
  // A stack rather than one slot: when two registrants overlap, the one
  // leaving must not take the other's scope with it.
  const [entries, setEntries] = useState<ScopeEntry[]>([]);

  const actions = useMemo<GlobalSearchActions>(
    () => ({
      open: () => handlerRef.current?.(),
      register: (handler) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) handlerRef.current = null;
        };
      },
      pushScope: (entry) => {
        setEntries((prev) => [...prev, entry]);
        return () => setEntries((prev) => prev.filter((e) => e.token !== entry.token));
      },
      updateScope: (entry) =>
        setEntries((prev) => prev.map((e) => (e.token === entry.token ? entry : e))),
    }),
    [],
  );

  const active = entries.at(-1)?.scope ?? null;

  return (
    <ActionsContext.Provider value={actions}>
      <ActiveScopeContext.Provider value={active}>{children}</ActiveScopeContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * Opens the modal the way ⌘K does, in the scope of whatever screen is mounted.
 * Outside a provider it does nothing.
 */
export function useGlobalSearch(): { open: OpenHandler } {
  const ctx = useContext(ActionsContext);
  return useMemo(() => ({ open: ctx?.open ?? (() => {}) }), [ctx]);
}

/** Scopes the search while the caller is mounted; `null` registers nothing. */
export function useSearchScope(scope: SearchScope | null): void {
  const ctx = useContext(ActionsContext);
  const [token] = useState(() => Symbol("search-scope"));
  const active = scope !== null;

  // Pushed once per mount; a new scope object replaces the entry in place
  // below, so it keeps its position in the stack.
  useEffect(() => {
    if (!ctx || !scope) return;
    return ctx.pushScope({ token, scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, active, token]);

  useEffect(() => {
    if (ctx && scope) ctx.updateScope({ token, scope });
  }, [ctx, scope, token]);
}

/** The scope of the most recently mounted registrant still mounted. */
export function useActiveSearchScope(): SearchScope | null {
  return useContext(ActiveScopeContext);
}

export function useRegisterGlobalSearch(handler: OpenHandler): void {
  const ctx = useContext(ActionsContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  const stable = useCallback(() => handlerRef.current(), []);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(stable);
  }, [ctx, stable]);
}
