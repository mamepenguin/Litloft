import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { useShortcuts } from "@/hooks/useShortcuts";

function Harness({
  contextId = "test",
  shortcuts,
  enabled = true,
  priority = 0,
}: {
  contextId?: string;
  shortcuts: Parameters<typeof useShortcuts>[2];
  enabled?: boolean;
  priority?: number;
}) {
  useShortcuts(contextId, contextId, shortcuts, enabled, priority);
  return null;
}

function StackHarness({
  layers,
}: {
  layers: { id: string; shortcuts: Parameters<typeof useShortcuts>[2] }[];
}) {
  return (
    <>
      {layers.map((l) => (
        <Harness key={l.id} contextId={l.id} shortcuts={l.shortcuts} />
      ))}
    </>
  );
}

describe("ShortcutsProvider priority tiers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("a higher tier wins over a context pushed later", () => {
    const overlay = vi.fn();
    const late = vi.fn();

    function LateLayer() {
      const [on, setOn] = useState(false);
      return (
        <>
          <Harness
            contextId="late"
            enabled={on}
            shortcuts={[{ key: "ctrl+k", label: "late", handler: late }]}
          />
          <button data-testid="enable-late" onClick={() => setOn(true)} />
        </>
      );
    }

    const { getByTestId } = render(
      <ShortcutsProvider>
        <Harness
          contextId="overlay"
          priority={OVERLAY_PRIORITY}
          shortcuts={[{ key: "ctrl+k", label: "overlay", handler: overlay }]}
        />
        <LateLayer />
      </ShortcutsProvider>,
    );

    // The late context is pushed after the overlay, so push order alone
    // would give it the chord.
    fireEvent.click(getByTestId("enable-late"));
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(overlay).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });

  it("within one tier, the most recently pushed context still wins", () => {
    const first = vi.fn();
    const second = vi.fn();

    render(
      <ShortcutsProvider>
        <StackHarness
          layers={[
            { id: "first", shortcuts: [{ key: "ctrl+k", label: "a", handler: first }] },
            { id: "second", shortcuts: [{ key: "ctrl+k", label: "b", handler: second }] },
          ]}
        />
      </ShortcutsProvider>,
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("ShortcutsProvider editingOnly partition", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fires non-editingOnly shortcut when no input has focus", () => {
    const handler = vi.fn();
    render(
      <ShortcutsProvider>
        <Harness shortcuts={[{ key: "k", label: "k", handler }]} />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document, { key: "k" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire non-editingOnly shortcut when textarea has focus", () => {
    const handler = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    render(
      <ShortcutsProvider>
        <Harness shortcuts={[{ key: "k", label: "k", handler }]} />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(textarea, { key: "k" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires editingOnly shortcut ONLY when an input element has focus", () => {
    const handler = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    render(
      <ShortcutsProvider>
        <Harness
          shortcuts={[
            { key: "ctrl+s", label: "save", handler, editingOnly: true },
          ]}
        />
      </ShortcutsProvider>,
    );
    // Not editing: should not fire
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
    // Editing: should fire
    input.focus();
    fireEvent.keyDown(input, { key: "s", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("partitions same key across stack layers by editingOnly", () => {
    const switcher = vi.fn();
    const linkInsert = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    render(
      <ShortcutsProvider>
        <StackHarness
          layers={[
            {
              id: "addon-global",
              shortcuts: [
                { key: "ctrl+k", label: "switcher", handler: switcher },
              ],
            },
            {
              id: "addon-editor",
              shortcuts: [
                {
                  key: "ctrl+k",
                  label: "link",
                  handler: linkInsert,
                  editingOnly: true,
                },
              ],
            },
          ]}
        />
      </ShortcutsProvider>,
    );
    // Without focus: switcher fires (editor's editingOnly skipped, falls to lower layer)
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(switcher).toHaveBeenCalledTimes(1);
    expect(linkInsert).not.toHaveBeenCalled();
    // With textarea focus: link fires
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true });
    expect(linkInsert).toHaveBeenCalledTimes(1);
    expect(switcher).toHaveBeenCalledTimes(1);
  });

  it("editingOnly:false fires regardless of focus state", () => {
    const handler = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    render(
      <ShortcutsProvider>
        <Harness
          shortcuts={[
            {
              key: "ctrl+shift+\\",
              label: "cycle",
              handler,
              editingOnly: false,
            },
          ]}
        />
      </ShortcutsProvider>,
    );
    // Without focus
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    // With textarea focus
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "\\", ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("walks down the stack to find a match in mid layers", () => {
    const middleHandler = vi.fn();
    render(
      <ShortcutsProvider>
        <StackHarness
          layers={[
            {
              id: "lower",
              shortcuts: [{ key: "x", label: "x", handler: middleHandler }],
            },
            {
              id: "upper",
              shortcuts: [{ key: "y", label: "y", handler: vi.fn() }],
            },
          ]}
        />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document, { key: "x" });
    expect(middleHandler).toHaveBeenCalledTimes(1);
  });

  it("? toggles cheat sheet when not editing, ignored when editing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { container } = render(
      <ShortcutsProvider>
        <Harness shortcuts={[]} />
      </ShortcutsProvider>,
    );
    // Not editing: opens cheat sheet (a dialog appears in the DOM)
    fireEvent.keyDown(document, { key: "?", shiftKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    // Close with Escape
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    // Editing: ignored
    input.focus();
    fireEvent.keyDown(input, { key: "?", shiftKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    void container;
  });
});
