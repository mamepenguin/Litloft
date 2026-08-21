import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InlineNameEditor } from "../InlineNameEditor";

function setup(overrides: Partial<Parameters<typeof InlineNameEditor>[0]> = {}) {
  const onCommit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <InlineNameEditor
      initialName="video.mp4"
      onCommit={onCommit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  const input = screen.getByRole("textbox") as HTMLInputElement;
  return { ...utils, input, onCommit, onCancel };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/** A click somewhere else on the page. */
function clickOutside() {
  fireEvent.pointerDown(document.body);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InlineNameEditor", () => {
  it("starts on the current name with the stem selected", () => {
    const { input } = setup();
    expect(input.value).toBe("video.mp4");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("video".length);
  });

  it("commits on Return", async () => {
    const { input, onCommit } = setup();
    type(input, "renamed.mp4");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onCommit).toHaveBeenCalledWith("renamed.mp4");
  });

  it("commits on Tab", async () => {
    const { input, onCommit } = setup();
    type(input, "renamed.mp4");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Tab" });
    });
    expect(onCommit).toHaveBeenCalledWith("renamed.mp4");
  });

  it("commits on a pointerdown outside the field", async () => {
    const { input, onCommit } = setup();
    type(input, "renamed.mp4");
    await act(async () => {
      clickOutside();
    });
    expect(onCommit).toHaveBeenCalledWith("renamed.mp4");
  });

  it("does not commit on a pointerdown inside the field", async () => {
    const { input, onCommit } = setup();
    type(input, "renamed.mp4");
    await act(async () => {
      fireEvent.pointerDown(input);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("trims and normalises before committing", async () => {
    const { input, onCommit } = setup();
    type(input, "  spaced.mp4  ");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onCommit).toHaveBeenCalledWith("spaced.mp4");
  });

  describe("blur is deliberately not a commit trigger", () => {
    it("ignores a plain blur", async () => {
      // The tree is virtualized: scrolling the row out of the window
      // unmounts the input and fires blur. Committing there would rename
      // a file because the user scrolled.
      const { input, onCommit } = setup();
      type(input, "renamed.mp4");
      await act(async () => {
        fireEvent.blur(input);
      });
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("ignores the window losing focus", async () => {
      const { input, onCommit } = setup();
      type(input, "renamed.mp4");
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
      });
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  it("cancels rather than commits when unmounted mid-edit", () => {
    const { input, onCommit, onCancel, unmount } = setup();
    type(input, "renamed.mp4");
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("cancels on Escape without committing", () => {
    const { input, onCommit, onCancel } = setup();
    type(input, "renamed.mp4");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("skips the request when the name is unchanged", async () => {
    const { input, onCommit, onCancel } = setup();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  describe("invalid names", () => {
    it("stays open with an error when Return is pressed", async () => {
      const { input, onCommit } = setup();
      type(input, "a/b.mp4");
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
      });
      expect(onCommit).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("abandons the edit when the user clicks away instead", async () => {
      const { input, onCommit, onCancel } = setup();
      type(input, "a/b.mp4");
      await act(async () => {
        clickOutside();
      });
      expect(onCommit).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("a rename the backend refuses", () => {
    const rejecting = () =>
      vi.fn().mockRejectedValue(new Error("A file with that name exists"));

    it("keeps the editor open and shows why, after Return", async () => {
      const onCommit = rejecting();
      const { input, onCancel } = setup({ onCommit });
      type(input, "taken.mp4");
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
      });

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "A file with that name exists",
        ),
      );
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("hands the message to the host and leaves, after a click away", async () => {
      // Staying open here would drag focus back on every click — a trap.
      const onCommit = rejecting();
      const { input, onCancel } = setup({ onCommit });
      type(input, "taken.mp4");
      await act(async () => {
        clickOutside();
      });

      await waitFor(() =>
        expect(onCancel).toHaveBeenCalledWith("A file with that name exists"),
      );
    });

    it("lets the user correct the name and retry", async () => {
      const onCommit = vi
        .fn()
        .mockRejectedValueOnce(new Error("A file with that name exists"))
        .mockResolvedValueOnce(undefined);
      const { input } = setup({ onCommit });

      type(input, "taken.mp4");
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
      });
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      type(screen.getByRole("textbox") as HTMLInputElement, "free.mp4");
      await act(async () => {
        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      });

      expect(onCommit).toHaveBeenNthCalledWith(2, "free.mp4");
    });
  });

  it("does not fire a second request while one is in flight", async () => {
    let release: (() => void) | undefined;
    const onCommit = vi.fn(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const { input } = setup({ onCommit });
    type(input, "renamed.mp4");

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

describe("IME composition", () => {
  /**
   * Measured in Chromium: confirming a conversion fires `compositionend`
   * and then a `keydown` that is indistinguishable from a bare Enter
   * (`isComposing: false`, `keyCode: 13`). Checking `isComposing` alone
   * does not catch it, so these fixtures reproduce the real ordering
   * rather than the one the naive guard assumes.
   */
  function confirmConversion(input: HTMLInputElement, text: string) {
    fireEvent.compositionStart(input);
    fireEvent.compositionUpdate(input, { data: text });
    fireEvent.change(input, { target: { value: text } });
    fireEvent.compositionEnd(input, { data: text });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  }

  it("does not commit when Enter confirms a conversion", async () => {
    const { input, onCommit } = setup();
    await act(async () => {
      confirmConversion(input, "日本語.txt");
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits on the next Enter, once the conversion is settled", async () => {
    const { input, onCommit } = setup();
    await act(async () => {
      confirmConversion(input, "日本語.txt");
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    });
    expect(onCommit).toHaveBeenCalledWith("日本語.txt");
  });

  it("does not cancel when Escape aborts a conversion", async () => {
    const { input, onCancel } = setup();
    fireEvent.compositionStart(input);
    fireEvent.compositionUpdate(input, { data: "にほん" });
    fireEvent.compositionEnd(input, { data: "" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on the next Escape", async () => {
    const { input, onCancel } = setup();
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input, { data: "" });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("ignores keys while a conversion is still in progress", async () => {
    const { input, onCommit, onCancel } = setup();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "にほんご" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("honours the legacy keyCode 229 signal", async () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: "日本語.txt" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("still commits an Enter pressed long after a composition ended", async () => {
    // Choosing a candidate with the mouse also ends the composition; the
    // Enter that follows is a deliberate confirmation of the rename.
    vi.useFakeTimers();
    try {
      const { input, onCommit } = setup();
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: "日本語.txt" } });
      fireEvent.compositionEnd(input, { data: "日本語.txt" });

      vi.setSystemTime(Date.now() + 1000);
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
      });
      expect(onCommit).toHaveBeenCalledWith("日本語.txt");
    } finally {
      vi.useRealTimers();
    }
  });
});
});
