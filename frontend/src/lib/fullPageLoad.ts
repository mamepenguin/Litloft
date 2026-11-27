/**
 * Navigate by loading the page from the server, dropping every client-side
 * provider's state. For a change of auth cookie: the sidebar, jump destinations,
 * addon catalogue and the WebSocket's drive filter are read under the cookie of
 * the moment and are not re-read by a client-side navigation.
 */
export function loadFullPage(path: string): void {
  window.location.href = path;
}
