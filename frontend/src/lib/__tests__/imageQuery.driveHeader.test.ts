import { afterEach, describe, expect, it, vi } from "vitest";

import {
  askImageAvailability,
  requestImageAnswer,
  type ImageEntry,
} from "@/lib/imageQuery";

const sentRequests: RequestInit[] = [];

function stubFetch(respond: () => Response) {
  const fetchStub = vi.fn((_input: RequestInfo | URL, init: RequestInit = {}) => {
    // `fetch` builds the request headers eagerly, so a value outside Latin-1
    // fails here as it does in a browser, before anything is sent.
    new Headers(init.headers);
    sentRequests.push(init);
    return Promise.resolve(respond());
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function imageEntry(): ImageEntry {
  return {
    id: "entry",
    blob: new Blob(["pixels"], { type: "image/png" }),
    type: "image/png",
    objectUrl: "",
    state: "loading",
    answer: null,
    failure: null,
    controller: null,
    used: 0,
  };
}

afterEach(() => {
  sentRequests.length = 0;
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-046: image query sends the drive header percent-encoded", () => {
  it.each(["動画", "videos"])(
    "askImageAvailability asks for %s and reads the drive as available",
    async (drive) => {
      stubFetch(() => jsonResponse(200, {}));

      await expect(askImageAvailability(drive)).resolves.toBe(true);

      expect(sentRequests).toHaveLength(1);
      expect(new Headers(sentRequests[0].headers).get("X-Lit-Drive")).toBe(
        encodeURIComponent(drive),
      );
    },
  );

  it.each(["動画", "videos"])(
    "requestImageAnswer asks for %s",
    async (drive) => {
      stubFetch(() => jsonResponse(200, {}));

      const result = await requestImageAnswer(
        drive,
        imageEntry(),
        new AbortController().signal,
      );

      expect(result).toHaveProperty("answer");
      expect(sentRequests).toHaveLength(1);
      expect(new Headers(sentRequests[0].headers).get("X-Lit-Drive")).toBe(
        encodeURIComponent(drive),
      );
    },
  );
});
