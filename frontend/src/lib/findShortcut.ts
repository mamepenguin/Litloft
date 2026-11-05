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
