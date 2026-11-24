/**
 * SPEC-CORE-109 step 1 / I1: the meaning-search availability answers
 * available / off / unknown, reuses a cached successful status answer and
 * never a cached failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAddonsStatus, getSemanticAvailability, invalidateAddonsCache } from "../addons";

const intelligence = { scope: "drive", label: "Intelligence" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const statusCalls: URL[] = [];
let answers: Array<() => Response> = [];

beforeEach(() => {
  invalidateAddonsCache();
  statusCalls.length = 0;
  answers = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      statusCalls.push(new URL(String(input), "http://localhost"));
      const next = answers.shift();
      if (!next) throw new Error("no answer queued");
      return next();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const listsIntelligence = () => json({ addons: { intelligence }, slots: {} });
const listsNothing = () => json({ addons: {}, slots: {} });
const serverError = () => json({ detail: "x" }, 500);
const networkError = (): Response => {
  throw new TypeError("network");
};

describe("SPEC-CORE-109 step 1 getSemanticAvailability answers", () => {
  it("available when the status lists the addon for the drive", async () => {
    answers.push(listsIntelligence);

    await expect(getSemanticAvailability("main")).resolves.toBe("available");
    expect(statusCalls[0].pathname).toBe("/api/addons/status");
    expect(statusCalls[0].searchParams.get("drive")).toBe("main");
  });

  it("off when the status answered and does not list the addon", async () => {
    answers.push(listsNothing);

    await expect(getSemanticAvailability("main")).resolves.toBe("off");
  });

  it.each([
    ["a server error", serverError],
    ["a network error", networkError],
  ])("unknown when the status request fails with %s", async (_label, answer) => {
    answers.push(answer);

    await expect(getSemanticAvailability("main")).resolves.toBe("unknown");
  });
});

describe("SPEC-CORE-109 I1 cached answers", () => {
  it("reuses a cached successful status answer without fetching", async () => {
    answers.push(listsIntelligence);
    await getAddonsStatus("main");
    expect(statusCalls).toHaveLength(1);

    await expect(getSemanticAvailability("main")).resolves.toBe("available");
    expect(statusCalls).toHaveLength(1);
  });

  it("fetches again when the cached status answer was a failure", async () => {
    answers.push(serverError, listsIntelligence);
    await getAddonsStatus("main");
    expect(statusCalls).toHaveLength(1);

    await expect(getSemanticAvailability("main")).resolves.toBe("available");
    expect(statusCalls).toHaveLength(2);
  });

  it("fetches again after its own failed lookup", async () => {
    answers.push(serverError, listsNothing);

    await expect(getSemanticAvailability("main")).resolves.toBe("unknown");
    await expect(getSemanticAvailability("main")).resolves.toBe("off");
    expect(statusCalls).toHaveLength(2);
  });

  it("does not reuse another drive's answer", async () => {
    answers.push(listsIntelligence, listsNothing);

    await expect(getSemanticAvailability("main")).resolves.toBe("available");
    await expect(getSemanticAvailability("photos")).resolves.toBe("off");
    expect(statusCalls[1].searchParams.get("drive")).toBe("photos");
  });
});
