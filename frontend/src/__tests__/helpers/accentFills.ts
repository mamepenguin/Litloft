/**
 * The exclusion is a closed set of interaction states rather than a skip-list
 * of variants, because a skip-list fails towards a missed fill; `aria-` and
 * `data-` prefixes are mostly resting states. A colon inside an arbitrary
 * variant (`[&:hover]:bg-accent`) is split on like any other and counted,
 * which errs on the cheap side.
 */
const ACCENT_FILLS = new Set(["bg-accent", "bg-accent-cta"]);

const INTERACTION_STATES = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
]);

/** Repeated, because they compose: `group-has-hover:` is one hover relayed twice. */
const RELAY = /^((group|peer|has|in)-)+/;

/**
 * Arbitrary values are deliberately not stripped: stripping can *create* a
 * match (`group-hover[x]` would reduce to `hover`).
 */
function isInteractionVariant(variant: string): boolean {
  // A named group or peer suffixes the variant: `group-hover/sidebar:`.
  const unnamed = variant.replace(/\/.*$/, "");
  // `not-hover:` is deliberately not relayed — it paints when the pointer
  // is *away*, which is the resting case.
  return INTERACTION_STATES.has(unnamed.replace(RELAY, ""));
}

function isRestingAccentFill(token: string): boolean {
  const parts = token.split(":");
  const utility = parts.pop() ?? "";
  if (!ACCENT_FILLS.has(utility)) return false;
  return !parts.some(isInteractionVariant);
}

export function accentFills(root: HTMLElement): HTMLElement[] {
  if (root.querySelectorAll("*").length === 0) {
    throw new Error(
      "accentFills: the root holds no elements — nothing was rendered, so " +
        "counting fills proves nothing",
    );
  }
  return [...root.querySelectorAll<HTMLElement>("[class]")].filter((el) =>
    // `getAttribute`, not `el.className`: on an SVG element `className` is
    // an `SVGAnimatedString`, not a string.
    (el.getAttribute("class") ?? "").split(/\s+/).some(isRestingAccentFill),
  );
}
