/**
 * SPEC-CORE-032 I17 — the undo toast adds a second button; a toast that
 * carries none has to behave exactly as it did before the option existed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider, useToast } from "../ToastProvider";

type Action = { label: string; onClick: () => void };

function Trigger({
  kind,
  message,
  action,
}: {
  kind: "error" | "success" | "info";
  message: string;
  action?: Action;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        action ? toast[kind](message, { action }) : toast[kind](message)
      }
    >
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

describe("SPEC-CORE-032 I17 a toast without an action", () => {
  it.each([
    ["error", "alert"],
    ["success", "status"],
    ["info", "status"],
  ] as const)(
    "SPEC-CORE-032 I17 keeps %s a %s that draws no extra control",
    (kind, role) => {
      render(
        <ToastProvider>
          <Trigger kind={kind} message="saved" />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText("fire"));

      const toast = screen.getByRole(role);
      expect(toast).toHaveTextContent("saved");
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
      expect(toast.querySelectorAll("button")).toHaveLength(1);
    },
  );

  it("SPEC-CORE-032 I17 still times out after five seconds", () => {
    render(
      <ToastProvider>
        <Trigger kind="success" message="saved" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getByText("saved")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText("saved")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("saved")).toBeNull();
  });
});

describe("SPEC-CORE-032 I17 a toast with an action", () => {
  const onClick = vi.fn();

  beforeEach(() => {
    onClick.mockReset();
  });

  it("SPEC-CORE-032 I17 draws the action beside the message", () => {
    render(
      <ToastProvider>
        <Trigger
          kind="success"
          message="3 marked done"
          action={{ label: "Undo", onClick }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("3 marked done");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-032 I17 runs the action from the toast", () => {
    render(
      <ToastProvider>
        <Trigger
          kind="success"
          message="1 marked done"
          action={{ label: "Undo", onClick }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("SPEC-CORE-032 I17 gives the action the toast's five seconds too", () => {
    render(
      <ToastProvider>
        <Trigger
          kind="success"
          message="2 marked done"
          action={{ label: "Undo", onClick }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByText("2 marked done")).toBeNull();
  });
});
