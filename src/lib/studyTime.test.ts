/**
 * Unit tests for the study-time aggregation + streak helpers.
 * Run: npx tsx src/lib/studyTime.test.ts
 * (Dependency-free, same style as stats/planner/dates tests.)
 */
import {
  blockMinutes,
  activeDayKeys,
  streakSummary,
  streakSummaryFromKeys,
  totalMinutes,
  aggregateBy,
  minutesPerDay,
  minutesPerDayRange,
  weekStartKey,
  minutesPerWeek,
  minutesPerCourse,
  studyTimeSummary,
  type TimeBlock,
} from "./studyTime";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const TODAY = "2026-06-07"; // a Sunday
const d = (iso: string) => new Date(iso + "T00:00:00Z");

const block = (over: Partial<TimeBlock> = {}): TimeBlock => ({
  date: d("2026-06-07"),
  minutes: 60,
  completed: false,
  actualMinutes: null,
  courseId: "c1",
  ...over,
});

// ---- blockMinutes ----------------------------------------------------------
check("blockMinutes planned = minutes", blockMinutes(block({ minutes: 45 }), "planned") === 45);
check(
  "blockMinutes completed = 0 when not done",
  blockMinutes(block({ minutes: 45, completed: false }), "completed") === 0,
);
check(
  "blockMinutes completed = minutes when done",
  blockMinutes(block({ minutes: 45, completed: true }), "completed") === 45,
);
check(
  "blockMinutes logged = actualMinutes",
  blockMinutes(block({ actualMinutes: 30 }), "logged") === 30,
);
check(
  "blockMinutes logged = 0 for null actual",
  blockMinutes(block({ actualMinutes: null }), "logged") === 0,
);
check(
  "blockMinutes logged = 0 for zero/negative actual",
  blockMinutes(block({ actualMinutes: 0 }), "logged") === 0 &&
    blockMinutes(block({ actualMinutes: -5 }), "logged") === 0,
);

// ---- activeDayKeys ---------------------------------------------------------
check("activeDayKeys empty = empty set", activeDayKeys([]).size === 0);
{
  const keys = activeDayKeys([
    block({ date: d("2026-06-05"), completed: true }),
    block({ date: d("2026-06-05"), completed: true }), // same day, dedup
    block({ date: d("2026-06-06"), completed: false }), // not completed → not active (default metric)
  ]);
  check("activeDayKeys dedups same day", keys.size === 1);
  check("activeDayKeys excludes uncompleted under default metric", !keys.has("2026-06-06"));
  check("activeDayKeys includes the completed day", keys.has("2026-06-05"));
}
{
  // Under the "logged" metric a day is active if it has real focus minutes,
  // even if the block isn't marked completed.
  const keys = activeDayKeys(
    [block({ date: d("2026-06-06"), completed: false, actualMinutes: 25 })],
    "logged",
  );
  check("activeDayKeys honors logged metric", keys.has("2026-06-06") && keys.size === 1);
}

// ---- streakSummary (raw blocks) --------------------------------------------
{
  const s = streakSummary([], TODAY);
  check("streak empty: current 0", s.current === 0);
  check("streak empty: longest 0", s.longest === 0);
  check("streak empty: totalActiveDays 0", s.totalActiveDays === 0);
  check("streak empty: lastActiveDay null", s.lastActiveDay === null);
}
{
  // Single day = today.
  const s = streakSummary([block({ date: d("2026-06-07"), completed: true })], TODAY);
  check("streak single today: current 1", s.current === 1);
  check("streak single today: longest 1", s.longest === 1);
  check("streak single today: lastActiveDay today", s.lastActiveDay === "2026-06-07");
}
{
  // Today not studied yet but yesterday was → grace keeps streak at 1.
  const s = streakSummary([block({ date: d("2026-06-06"), completed: true })], TODAY);
  check("streak grace (yesterday only): current 1", s.current === 1);
}
{
  // Stale activity 2+ days ago → current 0 but longest/total reflect history.
  const s = streakSummary([block({ date: d("2026-06-05"), completed: true })], TODAY);
  check("streak stale: current 0", s.current === 0);
  check("streak stale: longest 1", s.longest === 1);
  check("streak stale: lastActiveDay 06-05", s.lastActiveDay === "2026-06-05");
}
{
  // Three consecutive ending today.
  const s = streakSummary(
    [
      block({ date: d("2026-06-05"), completed: true }),
      block({ date: d("2026-06-06"), completed: true }),
      block({ date: d("2026-06-07"), completed: true }),
    ],
    TODAY,
  );
  check("streak 3 consecutive ending today: current 3", s.current === 3);
  check("streak 3 consecutive: longest 3", s.longest === 3);
  check("streak 3 consecutive: totalActiveDays 3", s.totalActiveDays === 3);
}
{
  // A gap breaks the current streak but longest is found elsewhere.
  const s = streakSummary(
    [
      block({ date: d("2026-06-01"), completed: true }),
      block({ date: d("2026-06-02"), completed: true }),
      block({ date: d("2026-06-03"), completed: true }),
      block({ date: d("2026-06-04"), completed: true }), // run of 4
      // gap on 06-05
      block({ date: d("2026-06-06"), completed: true }),
      block({ date: d("2026-06-07"), completed: true }), // current run of 2 ending today
    ],
    TODAY,
  );
  check("streak with gap: current 2", s.current === 2);
  check("streak with gap: longest 4", s.longest === 4);
  check("streak with gap: totalActiveDays 6", s.totalActiveDays === 6);
}
{
  // Day-boundary / month-boundary consistency.
  const s = streakSummary(
    [
      block({ date: d("2026-05-30"), completed: true }),
      block({ date: d("2026-05-31"), completed: true }),
      block({ date: d("2026-06-01"), completed: true }),
    ],
    "2026-06-01",
  );
  check("streak across month boundary: current 3", s.current === 3);
  check("streak across month boundary: longest 3", s.longest === 3);
}
{
  // Uncompleted blocks don't count under default metric.
  const s = streakSummary(
    [
      block({ date: d("2026-06-06"), completed: false }),
      block({ date: d("2026-06-07"), completed: false }),
    ],
    TODAY,
  );
  check("streak ignores uncompleted under default metric", s.current === 0 && s.longest === 0);
}

// ---- streakSummaryFromKeys (pre-built set) ---------------------------------
{
  const s = streakSummaryFromKeys(new Set(["2026-06-06", "2026-06-07"]), TODAY);
  check("streakFromKeys current 2", s.current === 2);
  check("streakFromKeys longest 2", s.longest === 2);
}
check(
  "streakFromKeys empty set → zeros/null",
  (() => {
    const s = streakSummaryFromKeys(new Set(), TODAY);
    return s.current === 0 && s.longest === 0 && s.lastActiveDay === null;
  })(),
);

// ---- totalMinutes ----------------------------------------------------------
check("totalMinutes empty = 0", totalMinutes([]) === 0);
{
  const blocks = [
    block({ minutes: 60, completed: true, actualMinutes: 75 }),
    block({ minutes: 30, completed: false, actualMinutes: 20 }),
    block({ minutes: 45, completed: true, actualMinutes: null }),
  ];
  check("totalMinutes completed (default) = 105", totalMinutes(blocks) === 105);
  check("totalMinutes planned = 135", totalMinutes(blocks, "planned") === 135);
  check("totalMinutes logged = 95", totalMinutes(blocks, "logged") === 95);
}

// ---- aggregateBy -----------------------------------------------------------
{
  const buckets = aggregateBy(
    [
      block({ courseId: "b", minutes: 10, completed: true }),
      block({ courseId: "a", minutes: 20, completed: true }),
      block({ courseId: "a", minutes: 5, completed: true }),
    ],
    (x) => x.courseId,
    "completed",
  );
  check("aggregateBy sorts keys ascending", buckets[0].key === "a" && buckets[1].key === "b");
  check("aggregateBy sums per key", buckets[0].minutes === 25 && buckets[1].minutes === 10);
}
{
  // A key with only uncompleted blocks still appears, with 0 under "completed".
  const buckets = aggregateBy(
    [block({ courseId: "z", minutes: 60, completed: false })],
    (x) => x.courseId,
    "completed",
  );
  check("aggregateBy keeps zero-minute bucket if key present", buckets.length === 1 && buckets[0].minutes === 0);
}

// ---- minutesPerDay ---------------------------------------------------------
{
  const buckets = minutesPerDay(
    [
      block({ date: d("2026-06-07"), minutes: 30, completed: true }),
      block({ date: d("2026-06-07"), minutes: 45, completed: true }),
      block({ date: d("2026-06-05"), minutes: 60, completed: true }),
      block({ date: d("2026-06-06"), minutes: 99, completed: false }), // 0 min, but day key present
    ],
    "completed",
  );
  // A day with only uncompleted blocks still appears (key present) with 0 min.
  check("minutesPerDay keeps present-but-zero days", buckets.length === 3);
  check("minutesPerDay oldest first", buckets[0].key === "2026-06-05");
  check("minutesPerDay uncompleted-only day is zero", buckets[1].key === "2026-06-06" && buckets[1].minutes === 0);
  check("minutesPerDay sums within a day (30+45)", buckets[2].key === "2026-06-07" && buckets[2].minutes === 75);
}
check("minutesPerDay empty = []", minutesPerDay([]).length === 0);

// ---- minutesPerDayRange (gap-filled) ---------------------------------------
{
  const range = minutesPerDayRange(
    [
      block({ date: d("2026-06-05"), minutes: 60, completed: true }),
      block({ date: d("2026-06-07"), minutes: 30, completed: true }),
    ],
    "2026-06-05",
    "2026-06-07",
    "completed",
  );
  check("range fills every day inclusive", range.length === 3);
  check("range gap day is zero", range[1].key === "2026-06-06" && range[1].minutes === 0);
  check("range endpoints carry minutes", range[0].minutes === 60 && range[2].minutes === 30);
}
check(
  "range single day window",
  (() => {
    const r = minutesPerDayRange(
      [block({ date: d("2026-06-07"), minutes: 25, completed: true })],
      "2026-06-07",
      "2026-06-07",
    );
    return r.length === 1 && r[0].minutes === 25;
  })(),
);
check("range inverted window = []", minutesPerDayRange([], "2026-06-07", "2026-06-01").length === 0);
check(
  "range excludes blocks outside window",
  (() => {
    const r = minutesPerDayRange(
      [block({ date: d("2026-06-01"), minutes: 99, completed: true })],
      "2026-06-05",
      "2026-06-07",
    );
    return r.length === 3 && r.every((x) => x.minutes === 0);
  })(),
);
check(
  "range spans month boundary",
  (() => {
    const r = minutesPerDayRange([], "2026-05-31", "2026-06-02");
    return r.length === 3 && r[0].key === "2026-05-31" && r[2].key === "2026-06-02";
  })(),
);

// ---- weekStartKey ----------------------------------------------------------
check("weekStartKey: Monday maps to itself", weekStartKey(d("2026-06-01")) === "2026-06-01");
check("weekStartKey: Sunday maps to that week's Monday", weekStartKey(d("2026-06-07")) === "2026-06-01");
check("weekStartKey: Wednesday maps back to Monday", weekStartKey(d("2026-06-03")) === "2026-06-01");
check("weekStartKey: next Monday is a new week", weekStartKey(d("2026-06-08")) === "2026-06-08");

// ---- minutesPerWeek --------------------------------------------------------
{
  const buckets = minutesPerWeek(
    [
      block({ date: d("2026-06-01"), minutes: 60, completed: true }), // week of 06-01 (Mon)
      block({ date: d("2026-06-07"), minutes: 30, completed: true }), // same week (Sun)
      block({ date: d("2026-06-08"), minutes: 90, completed: true }), // week of 06-08
    ],
    "completed",
  );
  check("minutesPerWeek buckets by ISO week", buckets.length === 2);
  check("minutesPerWeek keyed by Monday", buckets[0].key === "2026-06-01" && buckets[1].key === "2026-06-08");
  check("minutesPerWeek sums Mon..Sun (60+30)", buckets[0].minutes === 90);
  check("minutesPerWeek next week separate", buckets[1].minutes === 90);
}
check("minutesPerWeek empty = []", minutesPerWeek([]).length === 0);

// ---- minutesPerCourse ------------------------------------------------------
{
  const buckets = minutesPerCourse(
    [
      block({ courseId: "math", minutes: 60, completed: true }),
      block({ courseId: "math", minutes: 30, completed: true }),
      block({ courseId: "cs", minutes: 45, completed: true }),
      block({ courseId: "cs", minutes: 50, completed: false }), // ignored under completed
    ],
    "completed",
  );
  check("minutesPerCourse one bucket per course", buckets.length === 2);
  check("minutesPerCourse sorted by id", buckets[0].key === "cs" && buckets[1].key === "math");
  check("minutesPerCourse sums per course (math 90)", buckets[1].minutes === 90);
  check("minutesPerCourse respects completed metric (cs 45)", buckets[0].minutes === 45);
}
{
  const logged = minutesPerCourse(
    [
      block({ courseId: "math", minutes: 60, completed: false, actualMinutes: 70 }),
      block({ courseId: "math", minutes: 60, completed: true, actualMinutes: 50 }),
    ],
    "logged",
  );
  check("minutesPerCourse logged metric sums actual (120)", logged[0].minutes === 120);
}
check("minutesPerCourse empty = []", minutesPerCourse([]).length === 0);

// ---- studyTimeSummary (bundle) ---------------------------------------------
{
  const empty = studyTimeSummary([], TODAY);
  check("bundle empty: total 0", empty.total === 0);
  check("bundle empty: perDay []", empty.perDay.length === 0);
  check("bundle empty: perWeek []", empty.perWeek.length === 0);
  check("bundle empty: perCourse []", empty.perCourse.length === 0);
  check("bundle empty: streak.current 0", empty.streak.current === 0);
}
{
  const blocks = [
    block({ courseId: "c1", date: d("2026-06-05"), minutes: 60, completed: true, actualMinutes: 70 }),
    block({ courseId: "c2", date: d("2026-06-06"), minutes: 30, completed: true, actualMinutes: 25 }),
    block({ courseId: "c1", date: d("2026-06-07"), minutes: 45, completed: true, actualMinutes: null }),
    block({ courseId: "c2", date: d("2026-06-09"), minutes: 90, completed: false }), // future, uncompleted
  ];
  const s = studyTimeSummary(blocks, TODAY, "completed");
  check("bundle total completed = 135", s.total === 135);
  // perDay buckets one entry per day that has any block (06-05/06/07 + future
  // 06-09 which is present-but-zero under "completed").
  check("bundle perDay has 4 day buckets", s.perDay.length === 4);
  check(
    "bundle perDay future uncompleted day is zero",
    s.perDay[3].key === "2026-06-09" && s.perDay[3].minutes === 0,
  );
  check("bundle perCourse has 2 courses", s.perCourse.length === 2);
  // Two ISO weeks: week of 06-01 (Mon) holds 05/06/07; week of 06-08 holds 06-09.
  check("bundle perWeek has 2 weeks", s.perWeek.length === 2 && s.perWeek[0].key === "2026-06-01");
  check("bundle perWeek first week minutes = 135", s.perWeek[0].minutes === 135);
  check("bundle perWeek second week zero (only uncompleted)", s.perWeek[1].minutes === 0);
  check("bundle streak current = 3 (05,06,07 ending today)", s.streak.current === 3);
  check("bundle streak ignores uncompleted future block", s.streak.totalActiveDays === 3);

  // The bundle's streak always uses completed activity even when aggregating a
  // different metric — verify it's independent of the chosen metric.
  const logged = studyTimeSummary(blocks, TODAY, "logged");
  check("bundle logged total = 95", logged.total === 95);
  check("bundle streak metric-independent (still 3)", logged.streak.current === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
