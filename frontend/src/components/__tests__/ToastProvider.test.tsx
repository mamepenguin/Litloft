import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider, useToast } from "../ToastProvider";

function Trigger({
  kind,
  message,
}: {
  kind: "error" | "success" | "info";
  message: string;
}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast[kind](message)}>
      fire
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("renders nothing until a toast is pushed", () => {
    render(
      <ToastProvider>
        <Trigger kind="error" message="boom" />
      </ToastProvider>,
    );
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("surfaces an error toast with role=alert", () => {
    render(
      <ToastProvider>
        <Trigger kind="error" message="rename failed" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    const toast = screen.getByRole("alert");
    expect(toast).toHaveTextContent("rename failed");
  });

  it("surfaces success/info toasts with role=status", () => {
    render(
      <ToastProvider>
        <Trigger kind="success" message="saved" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("saved");
  });

  it("auto-dismisses after the default duration", () => {
    render(
      <ToastProvider>
        <Trigger kind="info" message="hello" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getByText("hello")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("hello")).toBeNull();
  });

  it("dismisses via the close button", () => {
    render(
      <ToastProvider>
        <Trigger kind="error" message="bye" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getByText("bye")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("bye")).toBeNull();
  });

  it("stacks multiple toasts at once", () => {
    render(
      <ToastProvider>
        <Trigger kind="error" message="first" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getAllByText("first")).toHaveLength(3);
  });

  it("returns a no-op API when no provider is mounted (defensive)", () => {
    // Render the trigger outside any provider — clicking must not throw.
    expect(() => {
      render(<Trigger kind="error" message="silenced" />);
      fireEvent.click(screen.getByText("fire"));
    }).not.toThrow();
    expect(screen.queryByText("silenced")).toBeNull();
  });
});
