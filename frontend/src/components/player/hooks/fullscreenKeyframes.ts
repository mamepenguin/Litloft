export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FrameLook {
  transform: string;
  clipPath: string;
}

export const FULL_LOOK: FrameLook = {
  transform: "translate(0px, 0px) scale(1)",
  clipPath: "inset(0px 0px 0px 0px round 0px)",
};

export const ENTRY_TIMING = { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
export const EXIT_TIMING = { duration: 200, easing: "ease-out" };

const RATIO = 16 / 9;

/**
 * The look that puts the viewport-sized, pinned frame exactly over its inline
 * 16:9 box: the 16:9 box centred in the viewport is scaled onto `rect`, and
 * the letterbox or pillarbox around it is clipped away. Applied with
 * `transform-origin: 0 0`.
 */
export function inlineLook(rect: Box, radius: number, viewport: Viewport): FrameLook {
  const w = Math.min(viewport.width, viewport.height * RATIO);
  const h = w / RATIO;
  const insetX = (viewport.width - w) / 2;
  const insetY = (viewport.height - h) / 2;
  const s = rect.width / w;
  const dx = rect.left - insetX * s;
  const dy = rect.top - insetY * s;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${s})`,
    clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${radius / s}px)`,
  };
}
