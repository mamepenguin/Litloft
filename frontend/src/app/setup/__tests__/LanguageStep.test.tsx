// LanguageStep test (RED phase)
//
// Choices:
// - Component receives `value` (current locale) and `onChange` callback.
// - "Next" button is the parent's responsibility, but we test that selecting
//   ja/en triggers onChange. The Next button being "enabled" once a value
//   is set is parent-level, but step exposes a primary action that calls onNext.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LanguageStep } from "@/app/setup/steps/LanguageStep";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LanguageStep", () => {
  it("calls onChange with 'ja' when ja option is clicked", () => {
    const onChange = vi.fn();
    render(<LanguageStep value="en" onChange={onChange} onNext={vi.fn()} />);
    const ja = screen.getByRole("button", { name: /日本語|ja/i });
    fireEvent.click(ja);
    expect(onChange).toHaveBeenCalledWith("ja");
  });

  it("calls onChange with 'en' when en option is clicked", () => {
    const onChange = vi.fn();
    render(<LanguageStep value="ja" onChange={onChange} onNext={vi.fn()} />);
    const en = screen.getByRole("button", { name: /english|en/i });
    fireEvent.click(en);
    expect(onChange).toHaveBeenCalledWith("en");
  });

  it("Next button is enabled when a locale is selected and triggers onNext", () => {
    const onNext = vi.fn();
    render(<LanguageStep value="ja" onChange={vi.fn()} onNext={onNext} />);
    const next = screen.getByRole("button", { name: /次へ|next/i });
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalled();
  });
});
