// PasswordStep test (RED phase)
//
// Choices:
// - PasswordStep receives `groups` (the union of groups from previous DriveStep)
//   and forces the master password entry to cover ALL groups.
// - Validation is client-side: the entry's groups must equal the input groups
//   set. We model this by having the component show a checkbox per group that
//   defaults to checked, and disabling Next when any group is unchecked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PasswordStep } from "@/app/setup/steps/PasswordStep";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PasswordStep", () => {
  it("requires non-empty password before enabling Next", () => {
    render(
      <PasswordStep
        groups={["default", "secret"]}
        value={{ password: "", groups: ["default", "secret"] }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).toBeDisabled();
  });

  it("calls onChange when password is typed", () => {
    const onChange = vi.fn();
    render(
      <PasswordStep
        groups={["default"]}
        value={{ password: "", groups: ["default"] }}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/パスワード|password/i), {
      target: { value: "master123" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ password: "master123" }),
    );
  });

  it("Next is enabled when password is set and all groups are covered", () => {
    render(
      <PasswordStep
        groups={["default", "secret"]}
        value={{ password: "master123", groups: ["default", "secret"] }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).not.toBeDisabled();
  });

  it("shows error or disables Next when groups don't cover all", () => {
    render(
      <PasswordStep
        groups={["default", "secret"]}
        value={{ password: "master123", groups: ["default"] }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).toBeDisabled();
  });

  it("with no groups: Next is enabled (admin-only password) and the groups picker is hidden", () => {
    render(
      <PasswordStep
        groups={[]}
        value={{ password: "master123", groups: [] }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // No drive carries a group → the password protects only /admin and the
    // wizard must not dead-end.
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).not.toBeDisabled();
    // The group checkbox picker is not rendered when there are no groups.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
