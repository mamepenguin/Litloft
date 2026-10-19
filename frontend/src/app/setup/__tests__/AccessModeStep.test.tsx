import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AccessModeStep } from "@/app/setup/steps/AccessModeStep";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccessModeStep", () => {
  it("renders 公開 and パスワード保護 radio options", () => {
    render(
      <AccessModeStep
        value="public"
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/全公開|public/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード保護|protected/i)).toBeInTheDocument();
  });

  it("calls onChange with 'public' when 全公開 selected", () => {
    const onChange = vi.fn();
    render(
      <AccessModeStep
        value="protected"
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/全公開|public/i));
    expect(onChange).toHaveBeenCalledWith("public");
  });

  it("calls onChange with 'protected' when パスワード保護 selected", () => {
    const onChange = vi.fn();
    render(
      <AccessModeStep
        value="public"
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/パスワード保護|protected/i));
    expect(onChange).toHaveBeenCalledWith("protected");
  });

  it("Next click invokes onNext", () => {
    const onNext = vi.fn();
    render(
      <AccessModeStep
        value="public"
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));
    expect(onNext).toHaveBeenCalled();
  });
});
