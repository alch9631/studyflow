/**
 * Pure column-layout math for the calendar's timed blocks (Calendar v2).
 *
 * When two or more timed blocks overlap in a single day column, stacking them on
 * top of each other hides the lower ones. Instead we lay overlapping blocks
 * side-by-side: each block gets a horizontal lane within its overlap CLUSTER, and
 * the column width is split across the cluster's lanes. A "cluster" is a maximal
 * run of blocks connected by overlap (A overlaps B, B overlaps C → all one
 * cluster, even if A and C don't touch).
 *
 * Everything here is pure and deterministic — no DOM, no wall clock — so it's
 * unit-testable. Geometry (px) is applied by the component; this layer only
 * decides lane index + lane count per block.
 */

/** A timed block reduced to what layout needs: an id and its [start,end) minutes. */
export type LayoutInput = { id: string; startMin: number; endMin: number };

/**
 * A laid-out block: its lane index (0-based, left→right) and the number of lanes
 * its overlap cluster spans. `left = lane/lanes`, `width = 1/lanes` (fractions of
 * the column) — the caller turns those into percentages.
 */
export type LayoutBlock = LayoutInput & { lane: number; lanes: number };

/**
 * Assign each block a lane + a per-cluster lane count so overlapping blocks sit
 * side-by-side. Blocks are processed earliest-first (ties broken by longer block,
 * then id) for a stable, deterministic layout. A block takes the lowest free lane
 * not used by any block it overlaps; once a cluster of mutually-connected blocks
 * is closed, every block in it is stamped with the cluster's max lane count so the
 * widths line up.
 *
 * Returned in the same order as the input (callers key by id, but stable order
 * keeps snapshots/tests readable).
 */
export function layoutDayBlocks(blocks: LayoutInput[]): LayoutBlock[] {
  if (blocks.length === 0) return [];

  // Deterministic processing order: by start, then longer first, then id.
  const order = [...blocks].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - b.startMin - (a.endMin - a.startMin) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const lane = new Map<string, number>();
  // A cluster is the set of blocks active in one continuous run of overlap. We
  // group blocks into clusters, lane them within the cluster, then stamp the
  // cluster's width (max lanes used) onto every member.
  type Cluster = { members: LayoutInput[]; laneEnds: number[] };
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  let clusterMaxEnd = -Infinity;

  for (const block of order) {
    // A block joins the current cluster if it overlaps the cluster's running span
    // (its start is before the latest end seen). Otherwise the cluster is closed
    // and a new one begins.
    if (current && block.startMin < clusterMaxEnd) {
      // continue current cluster
    } else {
      current = { members: [], laneEnds: [] };
      clusters.push(current);
      clusterMaxEnd = -Infinity;
    }

    // Lowest lane whose last block has already ended (no overlap) is reusable.
    let assigned = current.laneEnds.findIndex((end) => end <= block.startMin);
    if (assigned === -1) {
      assigned = current.laneEnds.length;
      current.laneEnds.push(block.endMin);
    } else {
      current.laneEnds[assigned] = block.endMin;
    }
    lane.set(block.id, assigned);
    current.members.push(block);
    clusterMaxEnd = Math.max(clusterMaxEnd, block.endMin);
  }

  // Per cluster, the number of lanes is the max concurrent overlap. Stamp it onto
  // every member so side-by-side widths are uniform within the cluster.
  const lanesById = new Map<string, number>();
  for (const c of clusters) {
    const lanes = Math.max(1, ...c.members.map((m) => (lane.get(m.id) ?? 0) + 1));
    for (const m of c.members) lanesById.set(m.id, lanes);
  }

  return blocks.map((b) => ({
    ...b,
    lane: lane.get(b.id) ?? 0,
    lanes: lanesById.get(b.id) ?? 1,
  }));
}
