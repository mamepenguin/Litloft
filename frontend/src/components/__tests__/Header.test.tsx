import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../Header";

const mockToggle = vi.fn();

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ toggle: mockToggle }),
}));

vi.mock("../GlobalSearch", () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

vi.mock("../ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("../LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

describe("Header", () => {
  it("renders menu button", () => {
    render(<Header />);
    expect(screen.getByLabelText("メニュー")).toBeInTheDocument();
  });

  it("calls toggle on menu click", () => {
    render(<Header />);
    fireEvent.click(screen.getByLabelText("メニュー"));
    expect(mockToggle).toHaveBeenCalled();
  });

  it("renders GlobalSearch", () => {
    render(<Header />);
    expect(screen.getByTestId("global-search")).toBeInTheDocument();
  });

  it("renders ThemeToggle", () => {
    render(<Header />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });
});
