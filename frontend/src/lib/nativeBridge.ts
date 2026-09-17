"use client";

/**
 * The one place that knows whether Litloft is running inside the iOS shell.
 * Everything here is a no-op in a browser, so callers stay free of
 * `if (native)` branches.
 */

const HANDLER_NAME = "litloft";
const RECEIVER_NAME = "__litloft";
const PING_TIMEOUT_MS = 2000;

/** What the shell needs to play something and label it on the lock screen. */
export interface MediaSource {
  url: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
}

/**
 * `loadId` and `seekId` are issued here and handed back unchanged by the shell,
 * so a report is matched to what it is about by equality rather than inferred
 * from its order. The shell drops a command whose `loadId` is not the file it
 * currently holds.
 */
export type MediaCommand =
  | ({ type: "media.load"; loadId: string } & MediaSource)
  | { type: "media.play"; loadId: string }
  | { type: "media.pause"; loadId: string }
  | { type: "media.seek"; loadId: string; seekId: string; time: number }
  | { type: "media.unload"; loadId: string }
  | { type: "media.setRate"; rate: number }
  | { type: "media.setVolume"; volume: number };

export type OutboundMessage = { type: "ping"; seq: number } | MediaCommand;

export type MediaStatus = "loading" | "ready" | "failed";

/** What the shell reports, sent whenever any of it changes. */
export interface MediaState {
  type: "media.state";
  /** Null when nothing is loaded. */
  loadId: string | null;
  status: MediaStatus;
  /** The last seek issued whose position the player has reached. */
  seekId: string | null;
  time: number;
  duration: number;
  paused: boolean;
  rate: number;
  volume: number;
  /** Seconds continuously readable from the start, not a total. */
  buffered: number;
  ended: boolean;
  /**
   * Asked to play and waiting for data: briefly at every start, and for as
   * long as a stream that stops answering stays silent, since that is not
   * reported as a failure.
   */
  waiting: boolean;
}

export type InboundMessage = { type: "pong"; seq: number } | MediaState;

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
