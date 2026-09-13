"use client";

export interface ControlBarScrimProps {
  backendOwnsFrame?: boolean;
}

/**
 * On its own `-z-10` layer so it can carry a blur without the controls above
 * it being blurred too. The blur keeps an embedded backend's own chrome in
 * this strip from reading as a second row of controls.
 *
 * Not while the backend owns the frame: an ad's skip button and the end
 * screen's links have to stay legible — obscuring them breaks the player
 * and, for ads, the API terms.
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
