/**
 * The fixture runs off `file://` with no Next router. Only the hooks the
 * bundled components call at render are provided.
 */
export function usePathname(): string {
  return "/drive/fixture";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string> {
  return {};
}

export function useRouter() {
  return { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} };
}
