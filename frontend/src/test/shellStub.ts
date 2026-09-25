interface ShellWindow extends Window {
  webkit?: unknown;
  __litloftShell?: { version?: number };
  __litloft?: unknown;
}

/** Stands in for the iOS shell's message handler; returns what the page posts to it. */
export function installShellStub(version: number): { posted: unknown[]; remove(): void } {
  const target = window as ShellWindow;
  const posted: unknown[] = [];
  target.__litloftShell = { version };
  target.webkit = { messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body) } } };
  return {
    posted,
    remove() {
      delete target.webkit;
      delete target.__litloftShell;
      delete target.__litloft;
    },
  };
}

export const immersive = (active: boolean) => ({ type: "page.immersive", active });
