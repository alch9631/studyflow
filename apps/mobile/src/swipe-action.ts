/** Require deliberate travel, independent of fling velocity or reveal animation. */
export function fullSwipeSide(translation: number, width: number, leading: boolean, trailing: boolean) {
  if (width <= 0) return null;
  const threshold = Math.max(160, width * 0.65);
  if (leading && translation >= threshold) return "leading";
  if (trailing && translation <= -threshold) return "trailing";
  return null;
}
