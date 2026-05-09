import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { NameInputDialog } from "../NameInputDialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useShortcuts", () => ({
  useShortcuts: () => undefined,
}));

describe("NameInputDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <NameInputDialog
        open={false}
        title="t"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("submit is disabled while the input is empty", () => {
    render(
      <NameInputDialog
        open
        title="New folder"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        submitLabel="Create"
      />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("submitting calls onSubmit with the trimmed value", () => {
    const onSubmit = vi.fn();
    render(
      <NameInputDialog
        open
        title="New folder"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        submitLabel="Create"
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  My Folder  " } });
    fireEvent.click(screen.getByText("Create"));
    expect(onSubmit).toHaveBeenCalledWith("My Folder");
  });

  it("cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <NameInputDialog
        open
        title="x"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
