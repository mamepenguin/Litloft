/**
 * SPEC-CORE-195 in Japanese. The shared test setup renders English, so this
 * file resolves keys against the merged ja tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import LoftPlayer from "../LoftPlayer";
import { _resetPlayerRegistryForTests, registerLoftPlayer } from "../playerRegistry";

vi.mock("next-intl", async () => {
  const ja = (await import("@/messages/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      ja,
    );
  const cache = new Map<string, (key: string) => string>();
  const useTranslations = (namespace?: string) => {
    const ns = namespace ?? "";
    if (!cache.has(ns)) {
      cache.set(ns, (key) => {
        const path = namespace === undefined ? key : `${namespace}.${key}`;
        const raw = lookup(path);
        return typeof raw === "string" ? raw : path;
      });
    }
    return cache.get(ns)!;
  };
  return {
    useTranslations,
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

beforeEach(() => {
  _resetPlayerRegistryForTests();
  registerLoftPlayer("youtube", () => <div data-testid="probe-embed" />);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-195 the read failure in Japanese", () => {
  it("SPEC-CORE-195 I9: says the .loft could not be read, in Japanese", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "File not found" }), { status: 404 })),
    );
    render(<LoftPlayer fileId="abc123456789" />);

    expect(await screen.findByText(".loft ファイルを読み込めませんでした")).toBeInTheDocument();
    expect(screen.queryByTestId("probe-embed")).not.toBeInTheDocument();
  });
});
