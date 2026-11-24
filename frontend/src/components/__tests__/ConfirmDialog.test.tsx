import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

vi.mock("@/lib/api", () => ({
  getFolders: vi.fn(async () => []),
  getFolderTree: vi.fn(async () => []),
}));

function pressEscape() {
  fireEvent.keyDown(document.body, { key: "Escape" });
}

function renderDialog(extra: Record<string, unknown> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ShortcutsProvider>
      <ConfirmDialog
        open
        title="Move to Trash"
        message="Move 3 files to trash?"
        confirmLabel="Confirm"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...extra}
      />
    </ShortcutsProvider>,
  );
  return { onConfirm, onCancel };
}

describe("SPEC-CORE-120 I13: ConfirmDialog without busy, progress or error", () => {
  it("I13 [SPEC-CORE-120] confirm calls onConfirm once and does not call onCancel", () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("I13 [SPEC-CORE-120] the Cancel button calls onCancel", () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("I13 [SPEC-CORE-120] the X button calls onCancel", () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("I13 [SPEC-CORE-120] Escape calls onCancel", () => {
    const { onCancel } = renderDialog();

    pressEscape();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

function backdrop(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".bg-black\\/60");
  if (!el) throw new Error("backdrop not rendered");
  return el;
}

describe("SPEC-CORE-120 I13: backdrop click without busy", () => {
  it("I13 [SPEC-CORE-120] the backdrop calls onCancel", () => {
    const { onCancel } = renderDialog();

    fireEvent.click(backdrop());

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("SPEC-CORE-120 I17: busy dialog ignores every dismissal path", () => {
  it("I17 [SPEC-CORE-120] while busy, a backdrop click does not call onCancel", () => {
    const { onCancel } = renderDialog({ busy: true, progress: "Processing 1 of 3" });

    fireEvent.click(backdrop());

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("I17 [SPEC-CORE-120] while busy, Cancel, X and Escape do not call onCancel", () => {
    const { onCancel } = renderDialog({ busy: true, progress: "Processing 1 of 3" });

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const close = screen.getByRole("button", { name: "Close" });
    fireEvent.click(cancel);
    fireEvent.click(close);
    pressEscape();

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("I17 [SPEC-CORE-120] while busy, confirm is disabled and does not call onConfirm", () => {
    const { onConfirm } = renderDialog({ busy: true, progress: "Processing 1 of 3" });

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-120 §9: running and failure lines of the dialog", () => {
  it("the progress line is shown with its count", () => {
    renderDialog({ busy: true, progress: "Processing 1 of 3" });

    expect(screen.getByText("Processing 1 of 3")).toBeInTheDocument();
  });

  it("the error line is shown below the message", () => {
    renderDialog({ error: "Could not complete. Please try again." });

    expect(screen.getByText("Could not complete. Please try again.")).toBeInTheDocument();
    expect(screen.getByText("Move 3 files to trash?")).toBeInTheDocument();
  });
});
