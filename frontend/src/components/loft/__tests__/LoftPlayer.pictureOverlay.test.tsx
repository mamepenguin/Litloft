import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { isValidElement } from "react";

import LoftPlayer from "../LoftPlayer";
import { registerLoftPlayer, _resetPlayerRegistryForTests } from "../playerRegistry";
import type { LoftEmbedProps } from "../types";

const recorded: Record<string, unknown>[] = [];

function ProbeEmbed(props: LoftEmbedProps) {
  recorded.push(props as unknown as Record<string, unknown>);
  return <div data-testid="probe-embed" />;
}

function serve(provider: string, url: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => ({ provider, url }) }),
  );
}

beforeEach(() => {
  recorded.length = 0;
  _resetPlayerRegistryForTests();
  registerLoftPlayer("youtube", ProbeEmbed);
  registerLoftPlayer("vimeo", ProbeEmbed);
  registerLoftPlayer("someprovider", ProbeEmbed);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-135 step 23 the .loft player hands the outline layer to every embed", () => {
  it.each([
    ["youtube", "https://youtu.be/abcdefghijk"],
    ["vimeo", "https://vimeo.com/123456"],
    ["someprovider", "https://example.com/v/1"],
  ])("passes a pictureOverlay node to the %s embed", async (provider, url) => {
    serve(provider, url);
    render(<LoftPlayer fileId="abc123456789" />);
    await screen.findByTestId("probe-embed");

    await waitFor(() => expect(isValidElement(recorded.at(-1)?.pictureOverlay)).toBe(true));
  });
});
