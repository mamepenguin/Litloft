/**
 * jsdom has no PointerEvent, and without one testing-library drops the
 * pointer's id, type and coordinates.
 */
export function installPointerEvent(): void {
  if (typeof window.PointerEvent !== "undefined") return;
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}
