import "./excelContainment.css";

import {
  releaseOfficeGrid,
  setOfficeGridActive,
  setOfficeGridFocusProbe,
} from "./officeGridActive";

interface SpreadsheetHandle {
  xs?: { sheet?: { reload?: () => void; focusing?: boolean } };
  observer?: MutationObserver | null;
}

export async function drawExcel(
  container: HTMLElement,
  frame: HTMLElement,
  bytes: ArrayBuffer,
): Promise<() => void> {
  await import("@js-preview/excel/lib/index.css");
  const { default: previewExcel } = await import("@js-preview/excel");
  const instance = previewExcel.init(container, { showContextmenu: false });
  const spreadsheet = instance as unknown as SpreadsheetHandle;

  // x-data-spreadsheet's window handlers act on every key, paste and copy
  // while its private `focusing` flag is set, and only a real click outside
  // the grid clears it. Clearing it here keeps them off the rest of the page.
  const releaseGridFocus = () => {
    const sheet = spreadsheet.xs?.sheet;
    if (sheet) sheet.focusing = false;
  };

  // The library's own observer makes the grid's inputs read-only and then
  // blurs `document.activeElement` wherever it is, 200 ms after any change in
  // the grid, so a resize would take focus from a field outside it. This one
  // does the same job and blurs only an element inside the grid.
  spreadsheet.observer?.disconnect();
  let lockQueued = false;
  const lockInputs = () => {
    lockQueued = false;
    for (const input of container.querySelectorAll("input")) {
      input.readOnly = true;
    }
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && container.contains(focused)) {
      focused.blur();
    }
  };
  const inputLock = new MutationObserver(() => {
    if (lockQueued) return;
    lockQueued = true;
    requestAnimationFrame(lockInputs);
  });
  inputLock.observe(container, { attributes: true, childList: true, subtree: true });
  lockInputs();

  let active = false;
  let drawn = false;
  let disposed = false;

  const onClickInside = () => {
    active = true;
    setOfficeGridActive(true);
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!active) return;
    if (event.target instanceof Node && frame.contains(event.target)) return;
    active = false;
    setOfficeGridActive(false);
    releaseGridFocus();
  };
  container.addEventListener("click", onClickInside);
  document.addEventListener("focusin", onFocusIn);
  const focusProbe = () => spreadsheet.xs?.sheet?.focusing === true;
  if (spreadsheet.xs) setOfficeGridFocusProbe(focusProbe);

  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (drawn) spreadsheet.xs?.sheet?.reload?.();
        });
  observer?.observe(frame);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    inputLock.disconnect();
    container.removeEventListener("click", onClickInside);
    document.removeEventListener("focusin", onFocusIn);
    releaseOfficeGrid(focusProbe, active);
    active = false;
    releaseGridFocus();
    try {
      instance.destroy();
    } catch {
      // The library throws when its wrapper has already left the container.
    }
  };

  try {
    await instance.preview(bytes);
  } catch (error) {
    dispose();
    throw error;
  }
  drawn = true;
  spreadsheet.xs?.sheet?.reload?.();
  return dispose;
}
