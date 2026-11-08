/**
 * The cards that start at or below the second row's bottom are the ones a
 * two-row shelf hides, in item order.
 */
export function hiddenRowIndices(
  itemTops: readonly number[],
  secondRowBottom: number,
): number[] {
  const hidden: number[] = [];
  itemTops.forEach((top, index) => {
    if (top >= secondRowBottom) hidden.push(index);
  });
  return hidden;
}
