import { expect, vi } from "vitest";

/** The name-in-use line, in the English messages the tests render with. */
export const NAME_IN_USE = "A collection with this name already exists";

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: ApiCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const nameInUse = () => json({ detail: "Name already in use" }, 409);

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * A `fetch` that answers by method and path, so a test does not depend on
 * what `lib/api` names its wrappers or how it types a failure. The handler
 * registered last for a route wins.
 */
export function createApiStub(fallback: Handler) {
  const calls: ApiCall[] = [];
  const routes: { method: string; path: RegExp; handler: Handler }[] = [];

  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = decodeURIComponent(new URL(url, "http://localhost").pathname);
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call = { method, path, body };
    calls.push(call);
    const route = [...routes].reverse().find((r) => r.method === method && r.path.test(path));
    return (route ? route.handler : fallback)(call);
  });

  return {
    fetch: fetchFn,
    calls,
    on(method: string, path: RegExp, handler: Handler) {
      routes.push({ method, path, handler });
    },
    count(method: string, path: RegExp) {
      return calls.filter((c) => c.method === method && path.test(c.path)).length;
    },
  };
}

function describers(input: HTMLElement): HTMLElement[] {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
}

/** The in-use state of SPEC-CORE-108 step 4, as a user and a screen reader meet it. */
export function expectNameInUse(input: HTMLInputElement, typed: string) {
  expect(input.isConnected, "the input is still open").toBe(true);
  expect(input.value).toBe(typed);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const line = describers(input).find((el) => (el.textContent ?? "").includes(NAME_IN_USE));
  expect(line, "the input is described by the name-in-use line").toBeDefined();
  expect(line!.className).toMatch(/danger/);
  expect((document.body.textContent ?? "").split(NAME_IN_USE)).toHaveLength(2);
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(typed.length);
  expect(input.selectionEnd).toBe(typed.length);
}

export function expectNoNameInUse(input?: HTMLInputElement | null) {
  expect(document.body.textContent ?? "").not.toContain(NAME_IN_USE);
  if (input) expect(input.getAttribute("aria-invalid")).not.toBe("true");
}
