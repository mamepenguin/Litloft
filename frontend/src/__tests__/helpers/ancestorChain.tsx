import type { ReactNode } from "react";

export interface AncestorSpec {
  position?: "relative" | "absolute" | "fixed" | "sticky";
  /**
   * No edge is optional: an omitted one reads as `undefined`, which makes
   * every comparison against it `false`.
   */
  box?: { top: number; bottom: number; left: number; right: number };
  clips?: boolean;
}

/** Wraps `children` in the given chain, outermost entry first. */
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
