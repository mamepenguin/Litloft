import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LoftPlayer from "../LoftPlayer";
import { registerLoftPlayer, _resetPlayerRegistryForTests } from "../playerRegistry";
import type { LoftEmbedProps } from "../types";

const recorded: LoftEmbedProps[] = [];

function ProbeEmbed(props: LoftEmbedProps) {
  recorded.push(props);
  return <div data-testid="probe-embed" />;
}

beforeEach(() => {
  recorded.length = 0;
  _resetPlayerRegistryForTests();
  registerLoftPlayer("youtube", ProbeEmbed);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({ provider: "youtube", url: "https://youtu.be/abcdefghijk" }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoftPlayer", () => {
  it("resolves the embed for the .loft provider", async () => {
    render(<LoftPlayer fileId="abc123456789" />);
    expect(await screen.findByTestId("probe-embed")).toBeInTheDocument();
  });

  it("passes durationHint through to the embed", async () => {
    render(<LoftPlayer fileId="abc123456789" durationHint={612} />);
    await screen.findByTestId("probe-embed");
    await waitFor(() => expect(recorded.at(-1)?.durationHint).toBe(612));
  });

  it("passes a null durationHint through unchanged", async () => {
    // A .loft whose metadata never yielded a duration must reach the
    // embed as null so ad detection can disable itself, rather than
    // being silently coerced to a number.
    render(<LoftPlayer fileId="abc123456789" durationHint={null} />);
    await screen.findByTestId("probe-embed");
    await waitFor(() => expect(recorded.at(-1)?.durationHint).toBeNull());
  });

  it("still forwards initialTime alongside the hint", async () => {
    render(<LoftPlayer fileId="abc123456789" durationHint={612} initialTime={90} />);
    await screen.findByTestId("probe-embed");
    await waitFor(() => expect(recorded.at(-1)?.initialTime).toBe(90));
  });
});
