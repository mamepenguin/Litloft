import type { YouTubePlayerLike } from "@/lib/mediaController";

export interface YouTubePlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayerLike }) => void;
    onError?: (event: { data: number }) => void;
    onStateChange?: (event: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: YouTubePlayerOptions,
  ) => YouTubePlayerLike & { destroy(): void };
}

interface WindowWithYT extends Window {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
}

let ytApiPromise: Promise<YTNamespace> | null = null;

// Caches the load Promise so concurrent callers attach to the same readiness
// signal without re-downloading the script. The IFrame API exposes one global
// onYouTubeIframeAPIReady callback; we chain instead of overwriting so a host
// or sibling addon that installed its own callback still fires.
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API requires a browser"));
  }
  const w = window as WindowWithYT;
  if (w.YT?.Player) {
    return Promise.resolve(w.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        // Don't let an unrelated handler block our own resolve.
      }
      if (w.YT?.Player) {
        resolve(w.YT);
      } else {
        reject(new Error("YouTube IFrame API loaded without YT.Player"));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    // Do NOT set crossOrigin="anonymous" — the API endpoint omits CORS
    // headers, and cookies are scoped to youtube.com so there's no
    // credential leak from loading as a plain <script>.
    script.onerror = () => {
      ytApiPromise = null;
      reject(new Error("Failed to load YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return ytApiPromise;
}
