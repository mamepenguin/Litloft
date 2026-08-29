"use client";

export interface ControlBarScrimProps {
  /**
   * True while the backend draws chrome of its own over the frame — an
   * ad, or an end screen.
   */
  backendOwnsFrame?: boolean;
}

/**
 * The legibility layer under a control bar that sits in the frame's
 * bottom strip. On its own `-z-10` layer so it can carry a blur without
 * the controls above it being blurred too (DESIGN.md, "Over-video
 * chrome").
 *
 * An embedded backend draws chrome of its own in this same strip —
 * YouTube's pause overlay puts a share pill, a related-video card and
 * its wordmark exactly where the transport and right-hand controls sit
 * — and a thin scrim lets that read as a second, broken row of
 * controls. Blurring what is behind us settles it: the backend's chrome
 * falls back to being a backdrop, and ours reads as the layer in front.
 *
 * Not while the backend owns the frame, though. An ad's skip button and
 * the end screen's links live in this strip too, and those have to stay
 * legible — obscuring them breaks the player and, for ads, the API
 * terms. Then the scrim goes back to the plain gradient.
 */
export function ControlBarScrim({
  backendOwnsFrame = false,
}: ControlBarScrimProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="control-bar-scrim"
      className={[
        "pointer-events-none absolute inset-0 -z-10",
        backendOwnsFrame
          ? "bg-gradient-to-t from-black/80 via-black/50 to-transparent"
          : [
              "bg-gradient-to-t from-black/95 to-black/60 backdrop-blur-[3px]",
              // The gradient alone fades the tint but not the blur,
              // which would end at a visible horizontal seam. The mask
              // fades the whole layer, blur included.
              "[mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]",
              "[-webkit-mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]",
            ].join(" "),
      ].join(" ")}
    />
  );
}
