import { Suspense, createElement, lazy, type ComponentType, type ReactNode } from "react";

export default function dynamic<P extends object>(
  load: () => Promise<ComponentType<P>>,
  options: { loading?: () => ReactNode } = {},
): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: await load() }));
  return function Dynamic(props: P) {
    return createElement(Suspense, { fallback: options.loading?.() ?? null }, createElement(Lazy, props));
  };
}
