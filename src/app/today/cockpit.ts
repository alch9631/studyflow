/**
 * Pure cockpit logic for the Today page — capacity/risk math and the study-queue
 * lane grouping. Kept dependency-free (no React, no DB, no wall clock) so it can
 * run on the server (page.tsx computes the lanes once) and be unit-reasoned about
 * in isolation. The page passes the already-computed lanes + risk down to the
 * client island, so the client never re-derives them.
 */

/** A serializable Today study block — the shape the cockpit UI consumes. */
export type CockpitBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
};

/** The four study-queue lanes, answering "what now / what can wait". */
export type Lane = "now" | "next" | "later" | "slide";

/** "1h 20m" / "45m" / "0m" — shared duration formatter (no i18n; numbers only). */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/**
 * Today's capacity picture, computed from the planned study minutes vs. the
 * realistic focus time left in the study window (after the day's lectures). This
 * is the input to the one-line risk verdict.
 */
export type Capacity = {
  /** Remaining (incomplete) planned study minutes today. */
  remainingMin: number;
  /** Realistic focus minutes left today (window minus lectures, focus-discounted). */
  availableMin: number;
  /** remaining - available, floored at 0 (how much we're over). */
  overMin: number;
  /** available - remaining, floored at 0 (slack/free time). */
  freeMin: number;
  /** True once remaining work fits in the available focus time. */
  onTrack: boolean;
};

/**
 * Compute today's capacity. `availableMin` is the window's realistic focus time
 * left (the page derives it from prefs' study window, the day's lectures, and a
 * focus ratio, the same spirit as the old header math). Everything here is pure
 * arithmetic so the verdict is deterministic given its inputs.
 */
export function computeCapacity(remainingMin: number, availableMin: number): Capacity {
  const rem = Math.max(0, remainingMin);
  const avail = Math.max(0, availableMin);
  const overMin = Math.max(0, rem - avail);
  const freeMin = Math.max(0, avail - rem);
  return { remainingMin: rem, availableMin: avail, overMin, freeMin, onTrack: rem <= avail };
}

/**
 * Risk verdict variant for the calm one-line risk line. Mapped to copy in the UI:
 *   - "over"     → "You're {time} over capacity today"
 *   - "tight"    → fits, but little slack (<= 20% of available free)
 *   - "ontrack"  → comfortable free time
 *   - "clear"    → nothing left to study today
 */
export type RiskVerdict = "over" | "tight" | "ontrack" | "clear";

export function riskVerdict(cap: Capacity): RiskVerdict {
  if (cap.remainingMin === 0) return "clear";
  if (!cap.onTrack) return "over";
  // "Tight" when it fits but the leftover slack is small relative to capacity.
  if (cap.availableMin > 0 && cap.freeMin <= cap.availableMin * 0.2) return "tight";
  return "ontrack";
}

/**
 * Split today's INCOMPLETE blocks into the four queue lanes.
 *
 * `blocks` arrives already in the page's plan order (study before review, longest
 * first). We honour that order so "Now" is genuinely the top of the plan.
 *
 *   - Can-slide: review-kind blocks always; PLUS, when over capacity, the lowest-
 *     priority study blocks (the shortest ones at the tail of the plan) until the
 *     remaining non-slide work fits the available focus time. This is the literal
 *     "what can wait" answer — push these to tomorrow first.
 *   - Of the work that must happen today: the first is "Now", the next is "Next",
 *     the rest are "Later".
 *
 * Completed blocks are excluded from lanes entirely (they're history, shown
 * collapsed elsewhere). Returns a per-block lane map keyed by id.
 */
export function assignLanes(
  blocks: CockpitBlock[],
  cap: Capacity,
): Map<string, Lane> {
  const lanes = new Map<string, Lane>();
  const open = blocks.filter((b) => !b.completed);

  // 1) Reviews always slide first (lowest priority — the "what can wait" answer).
  const reviews = open.filter((b) => b.kind === "review");
  const study = open.filter((b) => b.kind !== "review");
  for (const r of reviews) lanes.set(r.id, "slide");

  // 2) If still over capacity after sliding reviews, slide the lowest-priority
  //    study blocks too — shortest first, from the tail of the plan order — until
  //    the remaining must-do study fits the available focus time.
  let mustDo = [...study];
  if (cap.overMin > 0) {
    // Tail of plan order = lowest priority; shortest-first among equals so we shed
    // the least valuable minutes. Stable: keep plan order as the tiebreaker.
    const byLowestPriority = study
      .map((b, i) => ({ b, i }))
      .sort((a, z) => a.b.minutes - z.b.minutes || z.i - a.i);
    let studyMin = study.reduce((s, b) => s + b.minutes, 0);
    const slid = new Set<string>();
    for (const { b } of byLowestPriority) {
      if (studyMin <= cap.availableMin) break;
      slid.add(b.id);
      lanes.set(b.id, "slide");
      studyMin -= b.minutes;
    }
    mustDo = study.filter((b) => !slid.has(b.id));
  }

  // 3) The work that must happen today → Now / Next / Later by plan order.
  mustDo.forEach((b, i) => {
    lanes.set(b.id, i === 0 ? "now" : i === 1 ? "next" : "later");
  });

  return lanes;
}

/**
 * ENERGY OF THE DAY — a CLIENT-ONLY reorder of the displayed study queue. It
 * never persists, never re-plans, never touches prefs: it just reshuffles the
 * blocks the user looks at to match how much energy they have right now.
 *
 *   - "high"   → hardest/longest study blocks first (reviews/short work sink).
 *   - "low"    → short and review blocks first (ease in; big study sinks).
 *   - "normal" → the plan's own order, untouched.
 *
 * Pure and stable: equal-weight blocks keep their incoming (plan) order, so the
 * transform is deterministic. Completed blocks pass through unchanged in place is
 * not a concern here — the caller reorders only the open blocks it renders.
 */
export type Energy = "low" | "normal" | "high";

/** A block's "hardness" proxy: longer = harder; study outranks review. */
function hardness(b: CockpitBlock): number {
  const kindWeight = b.kind === "review" ? 0 : 1000; // study always above review
  return kindWeight + b.minutes;
}

export function reorderByEnergy(blocks: CockpitBlock[], energy: Energy): CockpitBlock[] {
  if (energy === "normal") return blocks;
  const indexed = blocks.map((b, i) => ({ b, i }));
  indexed.sort((x, y) => {
    const diff = hardness(y.b) - hardness(x.b); // hardest first
    const signed = energy === "high" ? diff : -diff; // low → easiest first
    // Stable tiebreak: keep the incoming plan order for equal-weight blocks.
    return signed !== 0 ? signed : x.i - y.i;
  });
  return indexed.map((x) => x.b);
}

/**
 * PANIC / CRUNCH triage — derived ONLY from the user's own data. No fabricated
 * "likely exam topics". Given today's incomplete blocks (each tagged with its
 * course's exam proximity and the student's own confidence rating), it splits
 * them into:
 *
 *   - mustDo: the highest-priority work — sooner exam first, then more effort
 *     (longer) first. These are the minimum-viable list to protect.
 *   - skim:   low-effort (short) OR review-kind OR already-"solid" topics — safe
 *     to skim or skip if time runs out.
 *
 * A block is a skim candidate when it's a review, a short session, or its topic
 * is self-rated "solid"; everything else is must-do. Pure + stable.
 */
export type TriageBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  kind: string;
  courseName: string;
  /** Whole days until this block's course exam (lower = more urgent). */
  examDays: number;
  /** Student's own confidence on the topic (null = unrated). */
  confidence: string | null;
};

export type Triage = {
  mustDo: TriageBlock[];
  skim: TriageBlock[];
};

/** Below this a session is "short" enough to be a skim/skip candidate. */
export const SKIM_MINUTES = 20;

export function buildTriage(blocks: TriageBlock[]): Triage {
  const isSkim = (b: TriageBlock) =>
    b.kind === "review" || b.minutes <= SKIM_MINUTES || b.confidence === "solid";
  const mustDo = blocks
    .filter((b) => !isSkim(b))
    // Sooner exam first; on a tie, more effort (longer) first.
    .sort((a, z) => a.examDays - z.examDays || z.minutes - a.minutes);
  const skim = blocks
    .filter(isSkim)
    .sort((a, z) => a.examDays - z.examDays || a.minutes - z.minutes);
  return { mustDo, skim };
}

/** The first "now"/"next"/"later" (must-do) block — the hero's next action. */
export function pickHero(
  blocks: CockpitBlock[],
  lanes: Map<string, Lane>,
): CockpitBlock | null {
  for (const lane of ["now", "next", "later"] as const) {
    const hit = blocks.find((b) => !b.completed && lanes.get(b.id) === lane);
    if (hit) return hit;
  }
  // Everything left is slide-able → still offer the first slide block as hero so
  // the user always has a "start something" affordance.
  const slide = blocks.find((b) => !b.completed && lanes.get(b.id) === "slide");
  return slide ?? null;
}
