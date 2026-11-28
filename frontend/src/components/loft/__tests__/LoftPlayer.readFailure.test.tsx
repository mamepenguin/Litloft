import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import LoftPlayer from "../LoftPlayer";
import { registerLoftPlayer, _resetPlayerRegistryForTests } from "../playerRegistry";
import type { LoftEmbedProps } from "../types";

const READ_FAILURE = "Could not read the .loft file";

const recorded: LoftEmbedProps[] = [];

function ProbeEmbed(props: LoftEmbedProps) {
  recorded.push(props);
  return <div data-testid="probe-embed" data-url={props.url} />;
}

type Answer =
  | { status: number; body: string; contentType?: string }
  | { network: true };

function json(status: number, body: unknown): Answer {
  return { status, body: JSON.stringify(body), contentType: "application/json" };
}

function toResponse(answer: Answer): Promise<Response> {
  if ("network" in answer) return Promise.reject(new TypeError("Failed to fetch"));
  return Promise.resolve(
    new Response(answer.body, {
      status: answer.status,
      headers: { "content-type": answer.contentType ?? "application/json" },
    }),
  );
}

const VALID = { provider: "youtube", url: "https://youtu.be/abcdefghijk" };

/** Holds every `/stream` read until the test answers it. */
function deferredStreams() {
  const waiting = new Map<string, (answer: Answer) => void>();
  const fetchSpy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const match = /\/api\/files\/([^/]+)\/stream/.exec(url);
    if (!match) return Promise.resolve(new Response("{}", { status: 404 }));
    const fileId = decodeURIComponent(match[1]);
    return new Promise<Response>((resolve, reject) => {
      waiting.set(fileId, (answer) => toResponse(answer).then(resolve, reject));
    });
  });
  async function answer(fileId: string, given: Answer) {
    await waitFor(() => expect(waiting.has(fileId)).toBe(true));
    const reply = waiting.get(fileId)!;
    waiting.delete(fileId);
    await act(async () => {
      reply(given);
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return { fetchSpy, answer };
}

function serve(answer: Answer) {
  vi.stubGlobal("fetch", vi.fn(() => toResponse(answer)));
}

function expectNothingPlayable() {
  expect(screen.queryByTestId("probe-embed")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
}

beforeEach(() => {
  recorded.length = 0;
  _resetPlayerRegistryForTests();
  registerLoftPlayer("youtube", ProbeEmbed);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-195 a .loft the player cannot read", () => {
  it.each([
    ["a 404 whose body looks like a .loft", json(404, VALID)],
    ["a 500 whose body looks like a .loft", json(500, VALID)],
    ["a 403 with an error detail", json(403, { detail: "Forbidden" })],
    ["a 200 whose body is not JSON", { status: 200, body: "<html>proxy</html>", contentType: "text/html" }],
    ["a 200 whose body is empty", { status: 200, body: "" }],
    ["a JSON array", json(200, [VALID])],
    ["JSON null", json(200, null)],
    ["a JSON string", json(200, "https://youtu.be/abcdefghijk")],
    ["no url", json(200, { provider: "youtube" })],
    ["no provider", json(200, { url: VALID.url })],
    ["an empty provider", json(200, { provider: "", url: VALID.url })],
    ["an empty url", json(200, { provider: "youtube", url: "" })],
    ["a numeric provider", json(200, { provider: 1, url: VALID.url })],
    ["a numeric url", json(200, { provider: "youtube", url: 5 })],
    ["a null url", json(200, { provider: "youtube", url: null })],
    ["a fetch that rejects", { network: true }],
  ] as const)("SPEC-CORE-195 I9: %s shows the message and no player or link", async (_name, answer) => {
    serve(answer as Answer);
    render(<LoftPlayer fileId="abc123456789" />);

    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();
    expectNothingPlayable();
  });

  it("SPEC-CORE-195 I9: a readable .loft beside it still plays", async () => {
    serve(json(500, VALID));
    render(<LoftPlayer fileId="abc123456789" />);
    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();
    cleanup();

    serve(json(200, VALID));
    render(<LoftPlayer fileId="abc123456789" />);
    expect(await screen.findByTestId("probe-embed")).toHaveAttribute("data-url", VALID.url);
    expect(screen.queryByText(READ_FAILURE)).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-195 §3 when the fileId changes", () => {
  it("SPEC-CORE-195 §3: the player stays in place until the new answer, which then decides", async () => {
    const streams = deferredStreams();
    vi.stubGlobal("fetch", streams.fetchSpy);
    const view = render(<LoftPlayer fileId="fileA0000001" />);
    await streams.answer("fileA0000001", json(200, VALID));
    const embed = await screen.findByTestId("probe-embed");

    view.rerender(<LoftPlayer fileId="fileB0000001" />);
    expect(screen.getByTestId("probe-embed")).toBe(embed);
    expect(screen.queryByText(READ_FAILURE)).not.toBeInTheDocument();

    await streams.answer("fileB0000001", json(404, { detail: "File not found" }));
    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();
    expectNothingPlayable();
  });

  it("SPEC-CORE-195 §3: the message stays until the new answer, which then decides", async () => {
    const streams = deferredStreams();
    vi.stubGlobal("fetch", streams.fetchSpy);
    const view = render(<LoftPlayer fileId="fileA0000002" />);
    await streams.answer("fileA0000002", json(200, { provider: "youtube" }));
    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();

    view.rerender(<LoftPlayer fileId="fileB0000002" />);
    expect(screen.getByText(READ_FAILURE)).toBeInTheDocument();

    await streams.answer("fileB0000002", json(200, { provider: "youtube", url: "https://youtu.be/BBBBBBBBBBB" }));
    expect(await screen.findByTestId("probe-embed")).toHaveAttribute("data-url", "https://youtu.be/BBBBBBBBBBB");
    expect(screen.queryByText(READ_FAILURE)).not.toBeInTheDocument();
  });

  it("SPEC-CORE-195 I10: an earlier fileId's late success does not replace a later read failure", async () => {
    const streams = deferredStreams();
    vi.stubGlobal("fetch", streams.fetchSpy);
    const view = render(<LoftPlayer fileId="fileA0000003" />);
    view.rerender(<LoftPlayer fileId="fileB0000003" />);

    await streams.answer("fileB0000003", json(500, { detail: "boom" }));
    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();

    await streams.answer("fileA0000003", json(200, VALID));
    expect(screen.getByText(READ_FAILURE)).toBeInTheDocument();
    expectNothingPlayable();
  });

  it("SPEC-CORE-195 I10: an earlier fileId's late failure does not replace a later player", async () => {
    const streams = deferredStreams();
    vi.stubGlobal("fetch", streams.fetchSpy);
    const view = render(<LoftPlayer fileId="fileA0000004" />);
    view.rerender(<LoftPlayer fileId="fileB0000004" />);

    await streams.answer("fileB0000004", json(200, { provider: "youtube", url: "https://youtu.be/BBBBBBBBBBB" }));
    expect(await screen.findByTestId("probe-embed")).toHaveAttribute("data-url", "https://youtu.be/BBBBBBBBBBB");

    await streams.answer("fileA0000004", json(404, VALID));
    expect(screen.getByTestId("probe-embed")).toHaveAttribute("data-url", "https://youtu.be/BBBBBBBBBBB");
    expect(screen.queryByText(READ_FAILURE)).not.toBeInTheDocument();

    view.rerender(<LoftPlayer fileId="fileC0000004" />);
    await streams.answer("fileC0000004", { status: 200, body: "not json" });
    expect(await screen.findByText(READ_FAILURE)).toBeInTheDocument();
  });
});
