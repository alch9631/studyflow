/**
 * Tiny perf-budget helper: cap how many items a big client list renders at once.
 *
 * The calendar's unscheduled lane and the catalog browser already keep their
 * lists short (collapse-by-default / search-first) so a phone never has to mount
 * dozens of interactive rows up front. This standardizes the "only show the
 * first N" primitive those lists lean on, so the cap is one obvious, testable
 * call instead of an ad-hoc `.slice(0, n)` sprinkled around:
 *
 *   const { items, hidden, capped } = capList(allRows, 30);
 *   // render `items`; if `capped`, show a "+{hidden} more" affordance.
 *
 * Pure, dependency-free, allocation-light (returns the original array untouched
 * when nothing is hidden) so it's safe to call in any render path.
 */

/** A bounded view of a list plus the metadata a "show more" control needs. */
export interface CappedList<T> {
  /** The first `max` items (or all of them when the list already fits). */
  items: T[];
  /** How many items were dropped past the cap (0 when nothing was hidden). */
  hidden: number;
  /** True when the cap actually trimmed the list (i.e. `hidden > 0`). */
  capped: boolean;
}

/**
 * Return at most `max` items from `items`, plus how many were hidden.
 *
 * `max` is clamped to >= 0, so a negative cap is treated as "show none" rather
 * than the surprising `slice(0, -n)` tail behaviour. When the list already fits
 * within the cap, the SAME array reference is returned (no copy) and `capped` is
 * false — callers can use that to skip rendering any "show more" affordance.
 */
export function capList<T>(items: readonly T[], max: number): CappedList<T> {
  const limit = Math.max(0, Math.floor(max));
  if (items.length <= limit) {
    return { items: items as T[], hidden: 0, capped: false };
  }
  return {
    items: items.slice(0, limit),
    hidden: items.length - limit,
    capped: true,
  };
}
