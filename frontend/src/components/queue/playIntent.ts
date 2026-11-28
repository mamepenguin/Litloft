/**
 * The selection made by a queue action, which starts the file whatever the
 * Autoplay preference says. It lives for the selection it was made for, so a
 * reload, Back / Forward or a link never finds one waiting.
 */
let pending: string | null = null;

export function requestPlay(fileId: string): void {
  pending = fileId;
}

export function takePlayIntent(fileId: string | null): boolean {
  if (fileId === null || pending !== fileId) return false;
  pending = null;
  return true;
}

export function clearPlayIntent(): void {
  pending = null;
}
