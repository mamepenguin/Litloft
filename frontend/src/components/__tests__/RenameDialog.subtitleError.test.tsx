import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { RenameDialog } from "../RenameDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

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

const ERROR = "行き先に同じ名前の字幕があります。 Night.ja.srt";

function renderDialog(error = ERROR, names?: string[]) {
  return render(
    <ShortcutsProvider>
      <RenameDialog
        open
        currentName="Night.mp4"
        error={error}
        errorNames={names}
        onRename={vi.fn()}
        onCancel={vi.fn()}
      />
    </ShortcutsProvider>,
  );
}

describe("SPEC-CORE-185 D8: a rename refused by a sidecar", () => {
  it("shows the translated message and the names inside the dialog as an alert", () => {
    renderDialog();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("行き先に同じ名前の字幕があります。");
    expect(alert.textContent).toContain("Night.ja.srt");
  });

  it("puts each name in bold on its own line under the message", () => {
    renderDialog("行き先に同じ名前の字幕があります。", [
      "Night.ja.srt",
      "Night.en.vtt",
    ]);

    const alert = screen.getByRole("alert");
    within(alert).getByText("行き先に同じ名前の字幕があります。");
    for (const name of ["Night.ja.srt", "Night.en.vtt"]) {
      const line = within(alert).getByText(name);
      expect(line.className).toContain("block");
      expect(line.className).toContain("font-semibold");
    }
  });

  it("turns the input's border to the danger colour", () => {
    renderDialog();

    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-danger");
  });
});
