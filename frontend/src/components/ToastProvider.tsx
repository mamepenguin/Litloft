"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import { prefersReducedMotion } from "@/lib/reducedMotion";

type ToastKind = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  leaving: boolean;
}

interface ToastApi {
  error: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 5000;
const LEAVE_MS = 150;
const TRAVEL_MS = 200;

/**
 * The offset the card is drawn at, from the travel animation alone. The
 * entrance moves a separate `translate` property, which must not be counted
 * here or the travel would double it.
 */
function drawnOffset(card: HTMLElement): number {
  const transform = getComputedStyle(card).transform;
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!matrix) return 0;
  const values = matrix[1].split(",").map(Number);
  return values.length === 6 ? values[5] : 0;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);
  const toastsRef = useRef<Toast[]>(toasts);
  toastsRef.current = toasts;

  const timersRef = useRef(new Set<number>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const restsRef = useRef(new Map<number, number>());
  const travelsRef = useRef(new Map<number, Animation>());

  const schedule = useCallback((run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      run();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  const dismiss = useCallback(
    (id: number) => {
      const toast = toastsRef.current.find((t) => t.id === id);
      if (!toast || toast.leaving) return;
      if (prefersReducedMotion()) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        return;
      }
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      schedule(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, LEAVE_MS);
    },
    [schedule],
  );

  const push = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [
        ...prev,
        { id, kind, message, action: options?.action, leaving: false },
      ]);
      schedule(() => dismiss(id), DEFAULT_DURATION_MS);
    },
    [dismiss, schedule],
  );

  const api: ToastApi = {
    error: useCallback((m, o) => push("error", m, o), [push]),
    success: useCallback((m, o) => push("success", m, o), [push]),
    info: useCallback((m, o) => push("info", m, o), [push]),
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const nextRests = new Map<number, number>();
    const reduced = prefersReducedMotion();
    if (viewport) {
      const cards = Array.from(
        viewport.querySelectorAll<HTMLElement>("[data-toast-id]"),
      );
      // The layout top, free of both the travel's `transform` and the
      // entrance's `translate`: what the card settles at once they end.
      const viewportTop = viewport.getBoundingClientRect().top;
      for (const card of cards) {
        const id = Number(card.dataset.toastId);
        const rest = viewportTop + card.offsetTop;
        nextRests.set(id, rest);
        const previous = restsRef.current.get(id);
        const travel = travelsRef.current.get(id);
        const travelled = travel ? drawnOffset(card) : 0;
        travel?.cancel();
        travelsRef.current.delete(id);
        if (previous === undefined || reduced) continue;
        if (typeof card.animate !== "function") continue;
        const dy = previous - rest + travelled;
        if (dy === 0) continue;
        travelsRef.current.set(
          id,
          card.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
            { duration: TRAVEL_MS, easing: "ease-out" },
          ),
        );
      }
    }
    for (const [id, travel] of travelsRef.current) {
      if (nextRests.has(id)) continue;
      travel.cancel();
      travelsRef.current.delete(id);
    }
    restsRef.current = nextRests;
  }, [toasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport
        viewportRef={viewportRef}
        toasts={toasts}
        onDismiss={dismiss}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Hooks called outside the provider get a no-op API so callers don't
    // have to guard.
    return {
      error: () => {},
      success: () => {},
      info: () => {},
    };
  }
  return ctx;
}

function ToastViewport({
  viewportRef,
  toasts,
  onDismiss,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      ref={viewportRef}
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Trigger the enter transition on next frame so the initial opacity-0
  // / translate-y-2 state actually paints before transitioning.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const leave = () => {
    const active = document.activeElement;
    if (
      cardRef.current &&
      active instanceof HTMLElement &&
      cardRef.current.contains(active)
    ) {
      active.blur();
    }
    onDismiss(toast.id);
  };

  const Icon =
    toast.kind === "error"
      ? XCircle
      : toast.kind === "success"
        ? CheckCircle2
        : Info;

  const colorClass =
    toast.kind === "error"
      ? "text-danger"
      : toast.kind === "success"
        ? "text-accent"
        : "text-text-muted";

  const drawn = toast.leaving
    ? "opacity-0"
    : visible
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-2";

  return (
    <div
      ref={cardRef}
      data-toast-id={toast.id}
      role={toast.kind === "error" ? "alert" : "status"}
      inert={toast.leaving}
      aria-hidden={toast.leaving ? "true" : undefined}
      className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl border border-bg-border bg-bg-primary px-3 py-2 shadow-lg transition-all duration-150 ${drawn}`}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${colorClass}`} />
      <p className="min-w-0 flex-1 text-sm text-text-primary">
        {toast.message}
      </p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            if (toast.leaving) return;
            toast.action?.onClick();
            leave();
          }}
          className="flex-shrink-0 rounded px-1.5 py-0.5 text-sm font-medium text-accent hover:bg-accent/10"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (toast.leaving) return;
          leave();
        }}
        className="flex-shrink-0 rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
