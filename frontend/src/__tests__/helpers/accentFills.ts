/**
 * One accent fill per screen (DESIGN.md §2.2, 00-basis 原則 2).
 *
 * The folder toolbar carried three at once — upload, play-all and the
 * selected half of the view toggle — which is the state §2.2 describes as
 * "the screen has not decided what it is for". This holds the budget
 * mechanically, because a fourth is one `className` away and nothing else
 * in the tree would notice.
 *
 * **A fill at rest, not the token.** `bg-accent/10` is a tint behind a
 * hovered row and `bg-accent-teal` is a different colour, so neither is
 * this utility at all. Of the utility itself, the only thing excluded is
 * a fill that needs an ongoing interaction to be visible at all.
 *
 * **The exclusion is a closed set of five pointer/keyboard states, not a
 * list of variants to skip**, and that shape is the point. A skip-list
 * fails towards a *missed* second fill, and this detector's cheap error
 * is the other one — a false positive costs a review comment, a false
 * negative ships the thing the rule exists to prevent. Two drafts of it
 * were wrong in the expensive direction: the first excluded every
 * prefixed token ("they only paint under a pointer" — true of `hover:`,
 * false of `sm:` and `dark:`), and the second still skipped `enabled:`,
 * `visited:`, `target:`, and the whole `aria-` and `data-` families.
 * Those last two are not pseudo-classes but open prefixes whose common
 * members are resting states — `aria-selected`, `data-[state=open]` —
 * so a selected-state fill written that way passed silently, which is
 * the exact case the paragraph above it in `DESIGN.md` §2.2 is about.
 * `data-[theme=dark]:` also contradicted that draft's own sentence about
 * theme variants, since `data-theme` is how this app switches theme
 * (`globals.css`).
 *
 * `disabled:` counts too, deliberately: a disabled control is sitting
 * there filled, which `DESIGN.md` §6 names as its own defect.
 *
 * **Two known limits, both on the cheap side.** A colon inside an
 * arbitrary variant is split on like any other — `[&:hover]:bg-accent`
 * and `has-[:hover]:bg-accent` are counted though they paint only under
 * a pointer — and `starting:` (`@starting-style`) is counted though it
 * paints for one frame. Both cost a review comment on a control nobody
 * writes that way today; a bracket-aware splitter would be more surface
 * to get wrong than the thing it protects, which is how the two earlier
 * drafts of this rule went wrong.
 */
const ACCENT_FILLS = new Set(["bg-accent", "bg-accent-cta"]);

/** The five states a fill can need an ongoing interaction to be seen in. */
const INTERACTION_STATES = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
]);

/**
 * Prefixes that relay one of those from another element, unchanged.
 *
 * Repeated, because they compose: `group-has-hover:` is one hover
 * relayed twice. Stripping once left it unrecognised.
 */
const RELAY = /^((group|peer|has|in)-)+/;

/**
 * There is no step here that strips arbitrary values, and there was one.
 *
 * It claimed to stop `data-[state=active]` being read as `active`, and
 * deleting it changed no verdict in the table below: the comparison is
 * for a whole name, and `data-[state=active]` is not `active` with the
 * brackets left on. Worse, stripping is the one direction that can
 * *create* a match — `group-hover[x]` would reduce to `hover` — which is
 * the expensive failure. A guard whose removal breaks nothing was
 * protecting against nothing.
 */
function isInteractionVariant(variant: string): boolean {
  // A named group or peer suffixes the variant: `group-hover/sidebar:`.
  // Standard syntax, and without this the name made the whole variant
  // unrecognisable — a hover fill would have failed a build.
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
  // A budget assertion against an empty tree is a green test that measured
  // nothing, and it reads exactly like one that measured a screen. Replacing
  // two screen assertions with `expect(accentFills(document.createElement("div")))
  // .toHaveLength(0)` left the whole suite green and the coverage table
  // satisfied, so the emptiness is refused here rather than trusted at each
  // call site.
  if (root.querySelectorAll("*").length === 0) {
    throw new Error(
      "accentFills: the root holds no elements — nothing was rendered, so " +
        "counting fills proves nothing",
    );
  }
  return [...root.querySelectorAll<HTMLElement>("[class]")].filter((el) =>
    // `getAttribute`, not `el.className`: on an SVG element `className` is
    // an `SVGAnimatedString`, whose `toString()` is the literal
    // "[object SVGAnimatedString]". lucide passes `className` straight to
    // its `<svg>`, so a fill put on an icon read as no classes at all.
    (el.getAttribute("class") ?? "").split(/\s+/).some(isRestingAccentFill),
  );
}
