import { ApiStatusError } from "@/lib/apiError";

/** Whether a write was refused because another collection holds the name. */
export function isNameInUse(error: unknown): boolean {
  return error instanceof ApiStatusError && error.status === 409;
}

/** Focus a field with the caret after its text. */
export function focusEnd(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
