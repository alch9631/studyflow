/**
 * Optimistic-overlay bookkeeping for the week calendar.
 *
 * The calendar renders server truth (`blocks`) with client-side overlays on top
 * so a resize or an unschedule-drag feels instant. The failure mode this module
 * exists to prevent: an overlay that OUTLIVES the gesture it belongs to. The
 * old code kept a resize's end-minute override forever (it was only removed on
 * failure), so after the server accepted the write and the block later MOVED,
 * the stale override pinned `endMin` to the old day's value — the card rendered
 * inverted ("15:00–11:00", a 17px sliver) and the next resize wrote that
 * corrupted duration back to the DB. The unschedule overlay had the twin bug:
 * a block re-placed via the placement sheet or auto-arrange stayed rendered as
 * unscheduled forever.
 *
 * The fix is the sticky-override pattern (see useOptimisticToggle): every
 * overlay records the SERVER value it was computed against (`base…`). It is
 * applied only while server truth still equals that base — the moment a
 * refresh brings anything else (the accepted write, a later move, another
 * tab's edit), the overlay stops applying, and {@link pruneOverrides} drops it
 * so a coincidental return to the base value can't resurrect it.
 */

/** A resize overlay: show `endMin` while the server still reports `base`. */
export type EndOverride = { endMin: number; base: number };

/** An unschedule overlay: render in `dayISO`'s lane, times nulled, while the
 *  server still reports the scheduled times it was dragged away from. */
export type UnscheduledOverride = {
  dayISO: string;
  baseStart: number | null;
  baseEnd: number | null;
};

/** The block fields the overlay logic reads/writes. */
export type OverridableBlock = {
  id: string;
  dayISO: string;
  startMin: number | null;
  endMin: number | null;
  completed: boolean;
};

/** Does this unschedule overlay still apply to what the server reports? */
function unscheduledApplies(b: OverridableBlock, o: UnscheduledOverride): boolean {
  return b.startMin === o.baseStart && b.endMin === o.baseEnd;
}

/** Does this resize overlay still apply to what the server reports? */
function endApplies(b: OverridableBlock, o: EndOverride): boolean {
  return b.endMin === o.base;
}

/**
 * Apply the live overlays to one server-truth block. Expired overlays (base no
 * longer matching) are ignored — server truth wins the moment it moves.
 */
export function applyBlockOverrides<B extends OverridableBlock>(
  b: B,
  doneOverride: Record<string, boolean>,
  endOverride: Record<string, EndOverride>,
  unscheduledOverride: Record<string, UnscheduledOverride>,
): B {
  const unsched = unscheduledOverride[b.id];
  const laneDay = unsched && unscheduledApplies(b, unsched) ? unsched.dayISO : null;
  const end = endOverride[b.id];
  return {
    ...b,
    completed: doneOverride[b.id] ?? b.completed,
    dayISO: laneDay ?? b.dayISO,
    startMin: laneDay != null ? null : b.startMin,
    endMin:
      laneDay != null ? null : end && endApplies(b, end) ? end.endMin : b.endMin,
  };
}

/**
 * Drop overlays that no longer apply (server truth moved off their base) or
 * whose block disappeared. Returns the SAME object when nothing changed, so a
 * `setState(prev => pruneOverrides(prev, …))` inside an effect keyed on the
 * blocks prop settles instead of looping.
 */
export function pruneOverrides<O>(
  overrides: Record<string, O>,
  blocks: OverridableBlock[],
  applies: (b: OverridableBlock, o: O) => boolean,
): Record<string, O> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  let changed = false;
  const next: Record<string, O> = {};
  for (const [id, o] of Object.entries(overrides)) {
    const b = byId.get(id);
    if (b && applies(b, o)) next[id] = o;
    else changed = true;
  }
  return changed ? next : overrides;
}

/** {@link pruneOverrides} specialized for the resize overlay. */
export function pruneEndOverrides(
  overrides: Record<string, EndOverride>,
  blocks: OverridableBlock[],
): Record<string, EndOverride> {
  return pruneOverrides(overrides, blocks, endApplies);
}

/** {@link pruneOverrides} specialized for the unschedule overlay. */
export function pruneUnscheduledOverrides(
  overrides: Record<string, UnscheduledOverride>,
  blocks: OverridableBlock[],
): Record<string, UnscheduledOverride> {
  return pruneOverrides(overrides, blocks, unscheduledApplies);
}
