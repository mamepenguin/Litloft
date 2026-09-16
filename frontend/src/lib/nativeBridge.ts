"use client";

/**
 * The one place that knows whether Litloft is running inside the iOS shell.
 * Everything here is a no-op in a browser, so callers stay free of
 * `if (native)` branches.
 */

const HANDLER_NAME = "litloft";
const RECEIVER_NAME = "__litloft";
const PING_TIMEOUT_MS = 2000;

export type OutboundMessage = { type: "ping"; seq: number };

export type InboundMessage = { type: "pong"; seq: number };

interface ShellMessageHandler {
  postMessage(body: unknown): void;
}

interface ShellWindow extends Window {
  webkit?: { messageHandlers?: Record<string, ShellMessageHandler | undefined> };
  [RECEIVER_NAME]?: { receive(payload: unknown): void };
}

function shellWindow(): ShellWindow | null {
  return typeof window === "undefined" ? null : (window as ShellWindow);
}

function handler(): ShellMessageHandler | null {
  return shellWindow()?.webkit?.messageHandlers?.[HANDLER_NAME] ?? null;
}

export function isNativeShell(): boolean {
  return handler() !== null;
}

export function postToShell(message: OutboundMessage): void {
  const target = handler();
  if (!target) return;
  try {
    target.postMessage(message);
  } catch {
    // The handler is gone — the web view is tearing down. Callers treat a
    // command as fire-and-forget, so there is nothing to report.
  }
}

const listeners = new Set<(message: InboundMessage) => void>();

function isInbound(payload: unknown): payload is InboundMessage {
  return typeof payload === "object" && payload !== null && typeof (payload as { type?: unknown }).type === "string";
}

/**
 * The shell delivers by calling this global, so it exists only while
 * something is listening and only inside the shell.
 */
function installReceiver(): void {
  const target = shellWindow();
  if (!target || target[RECEIVER_NAME]) return;
  target[RECEIVER_NAME] = {
    receive(payload: unknown) {
      if (!isInbound(payload)) return;
      for (const listener of [...listeners]) listener(payload);
    },
  };
}

function removeReceiver(): void {
  const target = shellWindow();
  if (target) delete target[RECEIVER_NAME];
}

export function subscribeToShell(listener: (message: InboundMessage) => void): () => void {
  if (!isNativeShell()) return () => {};

  listeners.add(listener);
  installReceiver();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) removeReceiver();
  };
}

let nextSeq = 0;

/** Resolves false in a browser, and on a shell that does not answer. */
export function pingShell(timeoutMs = PING_TIMEOUT_MS): Promise<boolean> {
  if (!isNativeShell()) return Promise.resolve(false);

  const seq = ++nextSeq;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answered: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(answered);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    const unsubscribe = subscribeToShell((message) => {
      if (message.type === "pong" && message.seq === seq) finish(true);
    });

    postToShell({ type: "ping", seq });
  });
}
