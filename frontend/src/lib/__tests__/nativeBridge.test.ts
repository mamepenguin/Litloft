import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Bridge = typeof import("../nativeBridge");

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloft?: { receive(payload: unknown): void };
}

const win = () => window as StubbedWindow;

async function load(): Promise<Bridge> {
  vi.resetModules();
  return import("../nativeBridge");
}

function installShell(): { posted: unknown[] } {
  const posted: unknown[] = [];
  win().webkit = { messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body) } } };
  return { posted };
}

function installThrowingShell(): void {
  win().webkit = {
    messageHandlers: {
      litloft: {
        postMessage: () => {
          throw new Error("the web view is tearing down");
        },
      },
    },
  };
}

function deliver(payload: unknown): void {
  win().__litloft?.receive(payload);
}

afterEach(() => {
  delete win().webkit;
  delete win().__litloft;
  vi.useRealTimers();
});

describe("outside the shell", () => {
  let bridge: Bridge;

  beforeEach(async () => {
    bridge = await load();
  });

  it("reports that it is not the native shell", () => {
    expect(bridge.isNativeShell()).toBe(false);
  });

  it("swallows a post rather than throwing", () => {
    expect(() => bridge.postToShell({ type: "ping", seq: 1 })).not.toThrow();
  });

  it("leaves no global behind when something subscribes", () => {
    const unsubscribe = bridge.subscribeToShell(() => {});
    expect(win().__litloft).toBeUndefined();
    unsubscribe();
  });

  it("never calls a listener", () => {
    const listener = vi.fn();
    bridge.subscribeToShell(listener);
    deliver({ type: "pong", seq: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves a ping as unanswered", async () => {
    await expect(bridge.pingShell()).resolves.toBe(false);
  });
});

describe("inside the shell", () => {
  let bridge: Bridge;
  let posted: unknown[];

  beforeEach(async () => {
    posted = installShell().posted;
    bridge = await load();
  });

  it("reports that it is the native shell", () => {
    expect(bridge.isNativeShell()).toBe(true);
  });

  it("hands a message to the shell", () => {
    bridge.postToShell({ type: "ping", seq: 7 });
    expect(posted).toEqual([{ type: "ping", seq: 7 }]);
  });

  it("routes a delivered message to every listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    bridge.subscribeToShell(first);
    bridge.subscribeToShell(second);

    deliver({ type: "pong", seq: 3 });

    expect(first).toHaveBeenCalledWith({ type: "pong", seq: 3 });
    expect(second).toHaveBeenCalledWith({ type: "pong", seq: 3 });
  });

  it("ignores a payload that is not a message", () => {
    const listener = vi.fn();
    bridge.subscribeToShell(listener);

    deliver(null);
    deliver("pong");
    deliver({ seq: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe and takes the global with it", () => {
    const listener = vi.fn();
    const unsubscribe = bridge.subscribeToShell(listener);
    expect(win().__litloft).toBeDefined();

    unsubscribe();
    expect(win().__litloft).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the global while another listener remains", () => {
    const unsubscribeFirst = bridge.subscribeToShell(() => {});
    bridge.subscribeToShell(() => {});

    unsubscribeFirst();

    expect(win().__litloft).toBeDefined();
  });

  it("resolves a ping that the shell answers", async () => {
    const answered = bridge.pingShell();
    const sent = posted.at(-1) as { seq: number };
    deliver({ type: "pong", seq: sent.seq });

    await expect(answered).resolves.toBe(true);
  });

  it("ignores a pong that answers a different ping", async () => {
    vi.useFakeTimers();
    const answered = bridge.pingShell(1000);
    const sent = posted.at(-1) as { seq: number };
    deliver({ type: "pong", seq: sent.seq + 1 });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(answered).resolves.toBe(false);
  });

  it("gives up on a shell that does not answer", async () => {
    vi.useFakeTimers();
    const answered = bridge.pingShell(1000);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(answered).resolves.toBe(false);
  });

  it("swallows a handler that throws while the view tears down", async () => {
    installThrowingShell();
    const tearing = await load();

    expect(() => tearing.postToShell({ type: "ping", seq: 1 })).not.toThrow();
    await expect(tearing.pingShell(1)).resolves.toBe(false);
  });

  it("gives two pings in flight different seqs", async () => {
    vi.useFakeTimers();
    const first = bridge.pingShell(1000);
    const second = bridge.pingShell(1000);

    const seqs = (posted as { seq: number }[]).map((m) => m.seq);
    expect(new Set(seqs).size).toBe(2);

    // Answer only the second: the first must stay unanswered.
    deliver({ type: "pong", seq: seqs[1] });
    await expect(second).resolves.toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toBe(false);
  });

  it("releases the global once a ping settles", async () => {
    const answered = bridge.pingShell();
    const sent = posted.at(-1) as { seq: number };
    deliver({ type: "pong", seq: sent.seq });
    await answered;

    expect(win().__litloft).toBeUndefined();
  });
});
