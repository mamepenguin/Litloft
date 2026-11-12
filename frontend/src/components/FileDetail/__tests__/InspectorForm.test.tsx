/**
 * The form the row measures reaches the components above the shell through
 * the store in `lib/inspectorFormStore`, and it belongs to one file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { FileDetailShell } from "../../FileDetailShell";
import { inspectorFormStore } from "@/lib/inspectorFormStore";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

let resize: (() => void) | undefined;
let rowWidth = 900;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1024,
  });
  window.localStorage.clear();
  window.localStorage.setItem(inspectorOpenStorageKey("main"), "true");
  rowWidth = 900;
  resize = undefined;
  class ResizeObserverMock {
    constructor(callback: () => void) {
      resize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => rowWidth,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fit = () => screen.getByTestId("inspector-fit-host").dataset.inspectorFit;

function renderFile(fileId: string, isPlayerFile = true) {
  return render(
    <FileDetailShell
      drive="main"
      title="clip.mp4"
      fileId={fileId}
      publishesForm
      isPlayerFile={isPlayerFile}
      inspector={<div />}
    >
      <div />
    </FileDetailShell>,
  );
}

async function measured(fileId: string, form: string) {
  await waitFor(() =>
    expect(inspectorFormStore.get(fileId).form).toBe(form),
  );
}

describe("the form store", () => {
  it("hands the form to a reader of the same file and absent to any other", async () => {
    renderFile("file-a");
    await measured("file-a", "stacked");

    expect(inspectorFormStore.get("file-a")).toMatchObject({
      form: "stacked",
      open: true,
      stacked: true,
    });
    expect(inspectorFormStore.get("file-b").form).toBe("absent");
    expect(inspectorFormStore.get(undefined).form).toBe("absent");
  });

  it("keeps the last form across a zero width, and clears only the attribute", async () => {
    // `display:none` reports 0. The stylesheet must stop acting on a form
    // nobody measured, but the content placed by the last one must not move.
    renderFile("file-c");
    await measured("file-c", "stacked");

    rowWidth = 0;
    act(() => resize?.());

    expect(fit()).toBeUndefined();
    expect(inspectorFormStore.get("file-c").form).toBe("stacked");
    expect(inspectorFormStore.get("file-c").stacked).toBe(true);
  });

  it("tells the store the phone, and keeps the attribute's two old values", async () => {
    // On a phone the inspector is the sheet, so nothing reads the form; the
    // attribute is still what the overlay CSS has always used.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });
    renderFile("file-d");
    await measured("file-d", "phone");
    expect(fit()).toBe("overlay");
  });

  it("resets on unmount only while it still holds this shell's own file", async () => {
    const first = renderFile("file-e");
    await measured("file-e", "stacked");

    // The next file's shell measures in its own commit, before the old
    // shell's cleanup runs.
    inspectorFormStore.publish("file-f", "beside", true);
    first.unmount();
    expect(inspectorFormStore.get("file-f").form).toBe("beside");
  });

  it("clears its own entry on unmount", async () => {
    const first = renderFile("file-g");
    await measured("file-g", "stacked");

    first.unmount();
    expect(inspectorFormStore.get("file-g").form).toBe("absent");
  });

  it("publishes the open state without touching the form", async () => {
    renderFile("file-h");
    await measured("file-h", "stacked");

    act(() => {
      screen.getByTestId("inspector-toggle").click();
    });

    await waitFor(() =>
      expect(inspectorFormStore.get("file-h")).toMatchObject({
        form: "stacked",
        open: false,
        stacked: false,
      }),
    );
    expect(fit()).toBe("stacked");
  });
});
