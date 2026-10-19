import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/lib/copyText";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
  });
}

function stubExecCommand(impl: (command: string) => boolean) {
  const spy = vi.fn(impl);
  // jsdom does not implement execCommand.
  Object.defineProperty(document, "execCommand", {
    value: spy,
    configurable: true,
  });
  return spy;
}

function textareas() {
  return document.body.querySelectorAll("textarea").length;
}

describe("copyText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it("writes through the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const exec = stubExecCommand(() => true);

    await expect(copyText("abc123")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("abc123");
    expect(exec).not.toHaveBeenCalled();
    expect(textareas()).toBe(0);
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    let copied: string | null = null;
    const exec = stubExecCommand((command) => {
      const el = document.activeElement as HTMLTextAreaElement;
      copied = el.value.slice(el.selectionStart, el.selectionEnd);
      return command === "copy";
    });

    await expect(copyText("abc123")).resolves.toBe(true);

    expect(exec).toHaveBeenCalledWith("copy");
    expect(copied).toBe("abc123");
    expect(textareas()).toBe(0);
  });

  it("falls back to execCommand outside a secure context", async () => {
    setClipboard(undefined);
    let copied: string | null = null;
    stubExecCommand(() => {
      const el = document.activeElement as HTMLTextAreaElement;
      copied = el.value.slice(el.selectionStart, el.selectionEnd);
      return true;
    });

    await expect(copyText("abc123")).resolves.toBe(true);

    expect(copied).toBe("abc123");
    expect(textareas()).toBe(0);
  });

  it("reports failure when execCommand refuses", async () => {
    setClipboard(undefined);
    stubExecCommand(() => false);

    await expect(copyText("abc123")).resolves.toBe(false);
    expect(textareas()).toBe(0);
  });

  it("reports failure when execCommand throws", async () => {
    setClipboard(undefined);
    stubExecCommand(() => {
      throw new Error("SecurityError");
    });

    await expect(copyText("abc123")).resolves.toBe(false);
    expect(textareas()).toBe(0);
  });

  it("reports failure when execCommand does not exist", async () => {
    setClipboard(undefined);

    await expect(copyText("abc123")).resolves.toBe(false);
    expect(textareas()).toBe(0);
  });

  it("returns focus to the element that had it", async () => {
    setClipboard(undefined);
    stubExecCommand(() => true);
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    await copyText("abc123");

    expect(document.activeElement).toBe(button);
  });
});
