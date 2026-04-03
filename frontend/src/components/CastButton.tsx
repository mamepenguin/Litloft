"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { useTranslations } from "next-intl";

type CastState = "disconnected" | "connecting" | "connected";

export function CastButton({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null> }) {
  const t = useTranslations("player");
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<CastState>("disconnected");
  const [watchId, setWatchId] = useState<number | null>(null);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !el.remote) return;

    const remote = el.remote;

    const onConnecting = () => setState("connecting");
    const onConnect = () => setState("connected");
    const onDisconnect = () => setState("disconnected");

    remote.addEventListener("connecting", onConnecting);
    remote.addEventListener("connect", onConnect);
    remote.addEventListener("disconnect", onDisconnect);

    let id: number | undefined;
    remote.watchAvailability((isAvailable: boolean) => {
      setAvailable(isAvailable);
    }).then((callbackId: number) => {
      id = callbackId;
      setWatchId(callbackId);
    }).catch(() => {
      setAvailable(true);
    });

    return () => {
      remote.removeEventListener("connecting", onConnecting);
      remote.removeEventListener("connect", onConnect);
      remote.removeEventListener("disconnect", onDisconnect);
      if (id !== undefined) {
        remote.cancelWatchAvailability(id).catch(() => {});
      }
    };
  }, [mediaRef]);

  const handleClick = useCallback(async () => {
    const el = mediaRef.current;
    if (!el || !el.remote) return;
    try {
      await el.remote.prompt();
    } catch {
      // User cancelled or no device available
    }
  }, [mediaRef]);

  if (!available) return null;

  const label = state === "connected"
    ? t("castConnected")
    : state === "connecting"
      ? t("castConnecting")
      : t("cast");

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        state === "connected"
          ? "bg-accent/20 text-accent"
          : state === "connecting"
            ? "bg-bg-hover text-accent animate-pulse"
            : "bg-bg-hover text-text-secondary hover:text-text-primary"
      }`}
      title={label}
    >
      <CastIcon state={state} />
      {label}
    </button>
  );
}

function CastIcon({ state }: { state: CastState }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
      {state === "connected" ? (
        <circle cx="2" cy="20" r="2" fill="currentColor" />
      ) : (
        <line x1="2" y1="20" x2="2.01" y2="20" />
      )}
    </svg>
  );
}
