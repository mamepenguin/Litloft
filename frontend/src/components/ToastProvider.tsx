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
}

interface ToastApi {
  error: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
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
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [
        ...prev,
        { id, kind, message, action: options?.action },
      ]);
      // ``setTimeout`` handle isn't tracked because the timer firing for an
      // already-removed id is a no-op.
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
      }
    },
    [dismiss],
  );

  const api: ToastApi = {
    error: useCallback((m, o) => push("error", m, o), [push]),
    success: useCallback((m, o) => push("success", m, o), [push]),
    info: useCallback((m, o) => push("info", m, o), [push]),
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
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="flex-shrink-0 rounded px-1.5 py-0.5 text-sm font-medium text-accent hover:bg-accent/10"
        >
          {toast.action.label}
        </button>
      )}
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
