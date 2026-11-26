import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { ApiStatusError } from "@/lib/apiError";
import { BatchRenameDialog } from "../BatchRenameDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

const api = vi.hoisted(() => ({ batchRename: vi.fn() }));
vi.mock("@/lib/api", () => api);

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

const files = [
  { id: "f1", filename: "photo_a.jpg" },
  { id: "f2", filename: "photo_b.jpg" },
];

function renderDialog() {
  return render(
    <ShortcutsProvider>
      <BatchRenameDialog
        open
        files={files}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    </ShortcutsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SPEC-CORE-185 185.8 I11: a batch rename refused by a sidecar", () => {
  it("shows subtitle_conflict's translated message with the names", async () => {
    api.batchRename.mockRejectedValueOnce(
      Object.assign(new ApiStatusError(409, "API error: 409 Conflict"), {
        code: "subtitle_conflict",
        names: ["Night.ja.srt", "Night.en.vtt"],
      }),
    );
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "名前を変更" }));

    const shown = await screen.findByText(/字幕の名前が重なるため変更できません。/);
    expect(shown).toBeInTheDocument();
    expect(shown.textContent).toContain("Night.ja.srt");
    expect(shown.textContent).toContain("Night.en.vtt");
    await waitFor(() =>
      expect(screen.queryByText("名前の変更に失敗しました")).toBeNull(),
    );
  });
});
