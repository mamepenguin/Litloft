import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { SelectionBar } from "../SelectionBar";

const api = vi.hoisted(() => ({
  batchDelete: vi.fn(),
  batchGetFiles: vi.fn(),
  batchMove: vi.fn(),
  batchPurge: vi.fn(),
  batchRestore: vi.fn(),
  batchTag: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("../ToastProvider", () => ({ useToast: () => toast }));

vi.mock("../ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("../CollectionPicker", () => ({ CollectionPicker: () => null }));
vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));
vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove }: { open: boolean; onMove: (path: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onMove("/dest")}>
        choose-destination
      </button>
    ) : null,
}));

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

const ids = ["f1", "f2", "f3"];

function renderBar() {
  return render(
    <SelectionBar
      count={ids.length}
      selectedIds={new Set(ids)}
      totalCount={10}
      drive="main"
      currentPath=""
      onSelectAll={vi.fn()}
      onClear={vi.fn()}
      onComplete={vi.fn()}
    />,
  );
}

async function move() {
  renderBar();
  fireEvent.click(screen.getByLabelText("移動"));
  fireEvent.click(screen.getByRole("button", { name: "choose-destination" }));
}

function messagesShown(): string[] {
  return [...toast.error.mock.calls, ...toast.success.mock.calls, ...toast.info.mock.calls].map(
    ([message]) => String(message),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SPEC-CORE-184 I17 / SPEC-CORE-185 I11: a batch move refused because of a subtitle", () => {
  it("tells the viewer how many files stayed put for a subtitle reason", async () => {
    api.batchMove.mockResolvedValueOnce({
      moved: 2,
      errors: [
        { id: "f3", error: "subtitle_name_taken", names: ["Night.ja.srt"] },
      ],
    });

    await move();

    await waitFor(() => expect(api.batchMove).toHaveBeenCalled());
    expect(messagesShown()).toContain("1 件は字幕のため移動しませんでした");
  });

  it("says nothing about subtitles when every file moved", async () => {
    api.batchMove.mockResolvedValueOnce({ moved: 3, errors: [] });

    await move();

    await waitFor(() => expect(api.batchMove).toHaveBeenCalled());
    expect(messagesShown().some((message) => message.includes("字幕のため"))).toBe(
      false,
    );
  });
});
