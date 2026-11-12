/**
 * The fixture runs off `file://` with no Next router. Only the hooks the
 * bundled components call at render are provided.
 *
 * An arrangement that needs an open file fills `__fixtureSearchParams` in
 * before it renders; every other one gets the empty query it had before.
 */

declare global {
  interface Window {
    __fixtureSearchParams?: URLSearchParams;
  }
}

export function usePathname(): string {
  return "/drive/fixture";
}

export function useSearchParams(): URLSearchParams {
  return typeof window === "undefined"
    ? new URLSearchParams()
    : (window.__fixtureSearchParams ?? new URLSearchParams());
}

export function useParams(): Record<string, string> {
  return {};
}

export function useRouter() {
  return { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} };
}
