import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";

type Module = typeof import("../shellImmersive");

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloftShell?: { version?: number };
  __litloft?: { receive(payload: unknown): void };
}

const win = () => window as StubbedWindow;

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "shell-contract.json"), "utf8"),
) as {
  commands: Record<string, unknown>;
  reports: { immersiveApplied: { type: string; active: boolean; width: number; height: number } };
};

async function load(): Promise<Module> {
  vi.resetModules();
  return import("../shellImmersive");
}

function installShell(version: number): unknown[] {
  const posted: unknown[] = [];
  win().__litloftShell = { version };
  win().webkit = { messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body) } } };
  return posted;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
}

function deliver(payload: unknown): void {
  win().__litloft?.receive(payload);
}

async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

const applied = contract.reports.immersiveApplied;

afterEach(() => {
  delete win().webkit;
  delete win().__litloftShell;
  delete win().__litloft;
  setViewport(0, 0);
  vi.useRealTimers();
});

describe("holding the shell immersive", () => {
  it("sends nothing and waits for nothing in a browser", async () => {
    vi.useFakeTimers();
    const { holdImmersive } = await load();

    const hold = holdImmersive();

    expect(await settled(hold.ready)).toBe(true);
    hold.release();
    expect(win().__litloft).toBeUndefined();
  });

  it("asks once for the first holder and lets go once for the last", async () => {
    const posted = installShell(4);
    const { holdImmersive } = await load();

    const first = holdImmersive();
    const second = holdImmersive();
    expect(posted).toEqual([contract.commands.immersiveOn]);

    first.release();
    first.release();
    expect(posted).toEqual([contract.commands.immersiveOn]);

    second.release();
    expect(posted).toEqual([contract.commands.immersiveOn, contract.commands.immersiveOff]);
  });

  it("asks again after everything has let go", async () => {
    const posted = installShell(4);
    const { holdImmersive } = await load();

    holdImmersive().release();
    holdImmersive();

    expect(posted).toEqual([
      contract.commands.immersiveOn,
      contract.commands.immersiveOff,
      contract.commands.immersiveOn,
    ]);
  });

  it("is ready once the shell has answered and the page's viewport has reached that size", async () => {
    vi.useFakeTimers();
    installShell(4);
    setViewport(applied.width, 812);
    const { holdImmersive } = await load();

    const hold = holdImmersive();
    expect(await settled(hold.ready)).toBe(false);

    deliver({ ...applied, active: false });
    expect(await settled(hold.ready)).toBe(false);

    deliver(applied);
    expect(await settled(hold.ready)).toBe(false);

    setViewport(applied.width, applied.height);
    await vi.advanceTimersByTimeAsync(50);
    expect(await settled(hold.ready)).toBe(true);
  });

  it("is not ready on an answer about letting go, even at the size the viewport already has", async () => {
    vi.useFakeTimers();
    installShell(4);
    setViewport(applied.width, 812);
    const { holdImmersive } = await load();

    const hold = holdImmersive();
    deliver({ ...applied, active: false, height: 812 });
    await vi.advanceTimersByTimeAsync(50);

    expect(await settled(hold.ready)).toBe(false);
  });

  it("is ready after a bounded wait when the shell never answers", async () => {
    vi.useFakeTimers();
    installShell(4);
    const { holdImmersive, IMMERSIVE_ANSWER_TIMEOUT_MS } = await load();

    const hold = holdImmersive();
    await vi.advanceTimersByTimeAsync(IMMERSIVE_ANSWER_TIMEOUT_MS - 1);
    expect(await settled(hold.ready)).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(hold.ready)).toBe(true);
  });

  it("does not wait in a shell that cannot answer", async () => {
    vi.useFakeTimers();
    const posted = installShell(3);
    const { holdImmersive } = await load();

    const hold = holdImmersive();

    expect(await settled(hold.ready)).toBe(true);
    expect(posted).toEqual([contract.commands.immersiveOn]);
  });

  it("gives a later holder the same wait as the first", async () => {
    vi.useFakeTimers();
    installShell(4);
    setViewport(applied.width, 812);
    const { holdImmersive } = await load();

    holdImmersive();
    const later = holdImmersive();
    expect(await settled(later.ready)).toBe(false);

    deliver(applied);
    setViewport(applied.width, applied.height);
    await vi.advanceTimersByTimeAsync(50);
    expect(await settled(later.ready)).toBe(true);
  });
});

describe("useShellImmersive", () => {
  it("holds only while asked to, and lets go on unmount", async () => {
    const posted = installShell(4);
    const { useShellImmersive } = await load();

    const { rerender, unmount } = renderHook(({ active }) => useShellImmersive(active), {
      initialProps: { active: false },
    });
    expect(posted).toEqual([]);

    rerender({ active: true });
    expect(posted).toEqual([contract.commands.immersiveOn]);

    unmount();
    expect(posted).toEqual([contract.commands.immersiveOn, contract.commands.immersiveOff]);
  });
});
