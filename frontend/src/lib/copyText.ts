/**
 * Resolves `false` rather than throwing, so the caller can show the text
 * for a manual copy instead.
 *
 * `navigator.clipboard` exists only in a secure context, and Litloft is
 * normally reached over plain http on a LAN address, so the `execCommand`
 * path is the one most devices take.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied or document not focused: the legacy path may still work.
    }
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document.execCommand !== "function") return false;

  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  // Off-screen rather than `display: none`: a hidden element cannot hold a
  // selection, and iOS Safari copies nothing from one.
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    // iOS Safari ignores `select()` on a read-only field.
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousFocus?.focus?.();
  }
}
