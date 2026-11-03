"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface LowerInspectorRegistry {
  lower: () => void;
  register: (impl: (() => void) | null) => void;
}

const LowerInspectorContext = createContext<LowerInspectorRegistry | null>(null);

export function useLowerInspectorRegistry(): LowerInspectorRegistry {
  const impl = useRef<(() => void) | null>(null);
  const lower = useCallback(() => impl.current?.(), []);
  const register = useCallback((next: (() => void) | null) => {
    impl.current = next;
  }, []);
  return useMemo(() => ({ lower, register }), [lower, register]);
}

export function LowerInspectorProvider({
  registry,
  children,
}: {
  registry: LowerInspectorRegistry;
  children: ReactNode;
}) {
  return (
    <LowerInspectorContext.Provider value={registry}>
      {children}
    </LowerInspectorContext.Provider>
  );
}

/** The shell that owns the sheet registers what lowering it means. */
export function useRegisterLowerInspector(impl: () => void) {
  const registry = useContext(LowerInspectorContext);
  useEffect(() => {
    registry?.register(impl);
    return () => registry?.register(null);
  }, [registry, impl]);
}
