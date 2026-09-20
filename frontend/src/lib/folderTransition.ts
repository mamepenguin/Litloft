import type { TransitionKind } from "./viewTransitions";

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function isStrictPrefix(shorter: string[], longer: string[]): boolean {
  return (
    shorter.length < longer.length &&
    shorter.every((segment, i) => segment === longer[i])
  );
}

/**
 * Which way a folder navigation goes, from the two pathnames alone. A
 * listing can offer folders that are not children of it — search results
 * reach across the drive — so the direction is worked out rather than
 * assumed from which control was pressed.
 *
 * Anything that is not a walk along one branch is flat: two folders side by
 * side have no up or down between them, and neither do two drives.
 */
export function folderTransitionKind(from: string, to: string): TransitionKind {
  const a = segments(from);
  const b = segments(to);
  if (isStrictPrefix(b, a)) return "folder-up";
  if (isStrictPrefix(a, b)) return "folder-down";
  return "folder-flat";
}
