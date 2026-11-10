/** How many positions are drawn: every position before the first one that has not settled. */
export function drawnPrefix(settled: readonly boolean[]): number {
  let drawn = 0;
  while (drawn < settled.length && settled[drawn]) drawn += 1;
  return drawn;
}
