"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

/**
 * Lightweight toast notification system. Built in-house (no third-party
 * dependency) since the only need today is surfacing failed mutations
 * that previously fell into empty ``catch`` blocks.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.error("Failed to rename collection");
 *
 * Toasts stack bottom-right (bottom-center on narrow screens), auto-
 * dismiss after 5 s, and can be dismissed by clicking the X. Multiple
 * toasts queue rather than replace.
 */

type ToastKind = "error" | "success" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      // Auto-dismiss. ``setTimeout`` handle isn't tracked because
      // dismissing on click is also handled by the ``setToasts`` filter
      // — the timer firing for an already-removed id is a no-op.
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
      }
    },
    [dismiss],
  );

  const api: ToastApi = {
    error: useCallback((m) => push("error", m), [push]),
    success: useCallback((m) => push("success", m), [push]),
    info: useCallback((m) => push("info", m), [push]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Defensive: hooks called outside the provider get a no-op API so
    // callers don't have to guard. This shouldn't happen in practice
    // because the provider lives in the root layout.
    return {
      error: () => {},
      success: () => {},
      info: () => {},
    };
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
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

  // Trigger the enter transition on next frame so the initial opacity-0
  // / translate-y-2 state actually paints before transitioning.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl border border-bg-border bg-bg-primary px-3 py-2 shadow-lg transition-all duration-150 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${colorClass}`} />
      <p className="min-w-0 flex-1 text-sm text-text-primary">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
