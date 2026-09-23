/**
 * The reading direction a PDF declares for itself, from its
 * `/ViewerPreferences /Direction`; `null` when it says nothing.
 */
export function declaredReadingDirection(
  preferences: unknown,
): "ltr" | "rtl" | null {
  if (!preferences || typeof preferences !== "object") return null;
  const direction = (preferences as { Direction?: unknown }).Direction;
  if (direction === "R2L") return "rtl";
  if (direction === "L2R") return "ltr";
  return null;
}
