import type { ReactNode } from "react";

/**
 * One ancestor in a chain built for a case about `useAnchoredDirection`.
 *
 * Only the three properties the walk reads. jsdom lays nothing out, so a
 * box is stated rather than measured — which makes a chain case evidence
 * about *which ancestor the walk picks*, and about nothing geometric.
 */
export interface AncestorSpec {
  /** Computed `position`. Omitted means static, which is jsdom's `""`. */
  position?: "relative" | "absolute" | "fixed" | "sticky";
  /**
   * The box it reports, if a case asks it for one.
   *
   * All four edges, and none of them optional: the walk reads every edge
   * to decide one axis or the other, and an omitted one reads as
   * `undefined`, which makes every comparison against it `false` — a
   * green that no longer depends on the code.
   */
  box?: { top: number; bottom: number; left: number; right: number };
  /** Whether it is a scrollport, and so a candidate frame. */
  clips?: boolean;
}

/**
 * Wraps `children` in the given chain, **outermost entry first**.
 *
 * The box goes on `data-box` rather than into a mock of its own, so a case
 * that adds an ancestor does not also have to be handed to the harness
 * separately. Whoever stubs `getBoundingClientRect` reads it back.
 */
export function Ancestors({
  chain,
  children,
}: {
  chain: AncestorSpec[];
  children: ReactNode;
}) {
  return chain.reduceRight<ReactNode>(
    (inner, spec, i) => (
      <div
        key={i}
        data-box={spec.box ? JSON.stringify(spec.box) : undefined}
        style={{
          ...(spec.position ? { position: spec.position } : {}),
          ...(spec.clips ? { overflowX: "auto", overflowY: "auto" } : {}),
        }}
      >
        {inner}
      </div>
    ),
    children,
  );
}
