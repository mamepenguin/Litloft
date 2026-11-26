import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfirmDialog } from "../ConfirmDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

function renderDialog(extra: Record<string, unknown> = {}) {
  return render(
    <ShortcutsProvider>
      <ConfirmDialog
        open
        title="字幕を削除しますか？"
        message=""
        confirmLabel="削除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...extra}
      />
    </ShortcutsProvider>,
  );
}

describe("SPEC-CORE-185 D6: ConfirmDialog with a rich body and a danger confirm", () => {
  it("renders the body inside the dialog", () => {
    renderDialog({
      body: (
        <div>
          <strong>The Long Night.ja.srt</strong>
          <p>ディスクから削除します。元に戻せません。</p>
          <p>同じ名前の動画 1 本からも消えます。</p>
        </div>
      ),
    });

    expect(screen.getByText("The Long Night.ja.srt")).toBeInTheDocument();
    expect(
      screen.getByText("ディスクから削除します。元に戻せません。"),
    ).toBeInTheDocument();
    expect(screen.getByText("同じ名前の動画 1 本からも消えます。")).toBeInTheDocument();
  });

  it("confirmTone=\"danger\" paints the confirm button as the danger control", () => {
    renderDialog({ confirmTone: "danger" });

    const confirm = screen.getByRole("button", { name: "削除" });
    expect(confirm.className).toContain("text-danger");
    expect(confirm.className).not.toContain("bg-accent");
  });
});

describe("SPEC-CORE-120 I13: ConfirmDialog without the new props", () => {
  it("keeps the confirm button as the primary control, not a danger one", () => {
    renderDialog();

    const confirm = screen.getByRole("button", { name: "削除" });
    expect(confirm.className).toContain("bg-accent");
    expect(confirm.className).not.toContain("text-danger");
  });
});
