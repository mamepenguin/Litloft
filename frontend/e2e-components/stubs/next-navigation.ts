/**
 * The fixture runs off `file://` with no Next router. Only the hooks the
 * bundled components call at render are provided.
 *
 * An arrangement that needs an open file fills `__fixtureSearchParams` in
 * before it renders; every other one gets the empty query it had before.
 * `__fixtureNavigate` moves the stub router to another URL and re-renders
 * every reader, so a case can walk from one screen to the next without a
 * reload.
 */

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    __fixtureSearchParams?: URLSearchParams;
    __fixturePathname?: string;
    __fixtureNavigate?: (pathname: string, query?: string) => void;
  }
}

const DEFAULT_PATHNAME = "/drive/fixture";
const EMPTY_QUERY = new URLSearchParams();

const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = (): number => version;

if (typeof window !== "undefined") {
  window.__fixtureNavigate = (pathname: string, query = "") => {
    window.__fixturePathname = pathname;
    window.__fixtureSearchParams = new URLSearchParams(query);
    version += 1;
    for (const listener of [...listeners]) listener();
  };
}

export function usePathname(): string {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return typeof window === "undefined"
    ? DEFAULT_PATHNAME
    : (window.__fixturePathname ?? DEFAULT_PATHNAME);
}

export function useSearchParams(): URLSearchParams {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return typeof window === "undefined"
    ? EMPTY_QUERY
    : (window.__fixtureSearchParams ?? EMPTY_QUERY);
}

export function useParams(): Record<string, string> {
  return {};
}

export function useRouter() {
  return { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} };
}
