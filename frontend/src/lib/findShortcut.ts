/**
 * The find bar yields the key to the browser whenever something it cannot
 * see past is in front of the page. Modal dialogs mark themselves with
 * `aria-modal`, and the player's pseudo-fullscreen sets
 * `data-player-fullscreen` on the root beside handing the request to the
 * real fullscreen API.
 */
export function canTakeFindShortcut(): boolean {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return false;
  if (document.documentElement.dataset.playerFullscreen === "true") return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  return true;
}

/**
 * The same test with the app sidebar left out. The sidebar marks itself
 * `aria-modal` while it is open over the page, but it dims the page rather
 * than covering it, so a key that acts on the page still reaches it.
 */
export function canTakeFocusModeShortcut(): boolean {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return false;
  if (document.documentElement.hasAttribute("data-player-fullscreen")) return false;
  const modals = document.querySelectorAll('[aria-modal="true"]');
  for (const modal of modals) {
    if (!modal.hasAttribute("data-app-sidebar")) return false;
  }
  return true;
}

/** A menu or popover opened from a control inside the header. */
export function isHeaderMenuOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('header [aria-expanded="true"]');
}
