import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  batchCopy: vi.fn(),
  batchMove: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({ useToast: () => toast }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages-core/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
  return {
    useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const path = namespace === undefined ? key : `${namespace}.${key}`;
      const raw = lookup(path);
      let text = typeof raw === "string" ? raw : path;
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    },
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});

import { ClipboardProvider, useClipboard } from "../ClipboardProvider";

const box: { api: ReturnType<typeof useClipboard> | null } = { api: null };

function Probe() {
  box.api = useClipboard();
  return <span data-testid="held">{box.api.clipboard?.fileIds.join(",") ?? "-"}</span>;
}

const IDS = ["f1", "f2", "f3"];

function messagesShown(): string[] {
  return [...toast.error.mock.calls, ...toast.success.mock.calls, ...toast.info.mock.calls].map(
    ([message]) => String(message),
  );
}

async function cutAndPaste() {
  render(
    <ClipboardProvider>
      <Probe />
    </ClipboardProvider>,
  );
  act(() => box.api!.cut(IDS, "main", "source"));
  await act(async () => {
    await box.api!.paste("main", "target");
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});

afterEach(cleanup);

describe("SPEC-CORE-184 I17 / SPEC-CORE-185 I11: a paste refused because of a subtitle", () => {
  it("reports how many files stayed put for a subtitle reason", async () => {
    api.batchMove.mockResolvedValue({
      moved: 2,
      errors: [
        { id: "f3", error: "subtitle_name_taken", names: ["Night.ja.srt"] },
      ],
    });

    await cutAndPaste();

    expect(messagesShown()).toContain("1 件は字幕のため移動しませんでした");
  });

  it("shows no subtitle notice when the refusal is not about one", async () => {
    api.batchMove.mockResolvedValue({
      moved: 2,
      errors: [{ id: "f3", error: "locked" }],
    });

    await cutAndPaste();

    expect(messagesShown().some((message) => message.includes("字幕のため"))).toBe(
      false,
    );
  });
});
