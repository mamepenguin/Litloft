/**
 * `env(safe-area-inset-top)` in pixels. CSS resolves it, so it is read from a
 * throwaway box that only carries that height; the reader must survive being
 * measured while the element that used to carry the inset is hidden.
 */
export function readSafeAreaTop(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top, 0px);pointer-events:none;visibility:hidden";
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}
