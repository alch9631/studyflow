import assert from "node:assert/strict";
import { calendarMonthDays, EXAM_COLORS, examColorMap, examDay, examISO, examOverviewMonths, examTimelineLayout, shiftExamMonth, upcomingExamDays } from "./examOverview";
import type { RemainingExam } from "./examSyncTypes";

const course = (id: string, date: string): RemainingExam => ({ id, name: id, currentDate: date, hint: "matched", suggestedKey: "", matchedKey: "", published: null });
let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }
const exams = [course("Math", "2026-11-06"), course("Algorithms", "2026-11-16"), course("Circuits", "2026-11-18"), course("Databases", "2026-12-03")];
const today = "2026-10-29";

check("November and December use the real Monday-first weekday positions", () => {
  const november = calendarMonthDays("2026-11");
  assert.equal(november.length, 42);
  assert.deepEqual(november.slice(0, 6), Array(6).fill(null));
  assert.equal(november[6], "2026-11-01");
  assert.equal(november[11], "2026-11-06");
  assert.equal(calendarMonthDays("2026-12")[1], "2026-12-01");
});
check("leap years, short months and year boundaries remain correct", () => {
  assert.equal(calendarMonthDays("2028-02").filter(Boolean).length, 29);
  assert.equal(calendarMonthDays("2027-02").filter(Boolean).length, 28);
  assert.equal(shiftExamMonth("2026-12", 1), "2027-01");
  assert.equal(shiftExamMonth("2027-01", -1), "2026-12");
});
check("the rail covers every upcoming exam and provides multiple months", () => {
  assert.deepEqual(examOverviewMonths(exams, today), ["2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(examOverviewMonths([course("one", "2026-12-31"), course("last", "2027-04-01")], today), ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  assert.deepEqual(examOverviewMonths([course("old", "2026-01-01")], today), []);
});
check("old dates stay out of the visualization and same-day exams stay grouped", () => {
  const grouped = upcomingExamDays([course("old", "2026-10-28"), course("one", today), course("two", today)], today);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].exams.length, 2);
  assert.equal(grouped[0].date, today);
});
check("date differences are stable through both daylight-saving transitions", () => {
  assert.equal(examDay("2027-03-29") - examDay("2027-03-28"), 1);
  assert.equal(examDay("2026-10-26") - examDay("2026-10-25"), 1);
  assert.equal(examISO(examDay("2028-02-29")), "2028-02-29");
  for (const invalid of ["2027-02-29", "2026-11-31", "broken"]) assert.throws(() => examDay(invalid));
});
check("timeline positions reflect the actual 10, 2 and 15 day gaps", () => {
  const layout = examTimelineLayout(exams, today, 358)!;
  const [first, second, third, fourth] = layout.points;
  assert.ok(Math.abs((second.x - first.x) / (third.x - second.x) - 5) < 0.00001);
  assert.ok(Math.abs((fourth.x - third.x) / (third.x - second.x) - 7.5) < 0.00001);
  assert.ok(layout.points.every((point) => point.x >= 24 && point.x <= 334));
});
check("nearby callouts can cluster without moving the individual exam dates", () => {
  const close = [...exams, ...Array.from({ length: 4 }, (_, index) => course(`Extra ${index}`, `2026-11-${String(7 + index).padStart(2, "0")}`))];
  const layout = examTimelineLayout(close, today, 288)!;
  assert.ok(layout.clusters.some((cluster) => cluster.dates.length > 1));
  assert.equal(layout.points.length, 8);
  assert.equal(layout.clusters.flatMap((cluster) => cluster.dates).length, 8);
});
check("dense schedules keep labels within the plot and separate their lanes", () => {
  const dense = Array.from({ length: 50 }, (_, index) => course(`Course ${index}`, examISO(examDay(today) + index * 2)));
  for (const width of [288, 358, 704]) {
    const layout = examTimelineLayout(dense, today, width)!;
    for (const cluster of layout.clusters) assert.ok(cluster.labelX - 52 >= 0 && cluster.labelX + 52 <= width);
    for (const lane of new Set(layout.clusters.map((cluster) => cluster.lane))) {
      const labels = layout.clusters.filter((cluster) => cluster.lane === lane);
      labels.slice(1).forEach((cluster, index) => assert.ok(cluster.labelX - labels[index].labelX >= 104));
    }
    assert.ok(layout.height < 400);
  }
});
check("single exams, no exams and shared exam days have finite layouts", () => {
  assert.equal(examTimelineLayout([], today, 358), null);
  const layout = examTimelineLayout([course("one", today), course("two", today)], today, 358)!;
  assert.equal(layout.points.length, 1);
  assert.equal(layout.points[0].exams.length, 2);
  assert.ok(Number.isFinite(layout.points[0].x));
});
check("colors survive date reordering", () => {
  const before = examColorMap(exams);
  const after = examColorMap([...exams].reverse().map((exam) => ({ ...exam, currentDate: "2027-01-01" })));
  for (const exam of exams) assert.deepEqual(after.get(exam.id), before.get(exam.id));
});
check("calendar numerals have AA contrast in both themes", () => {
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  for (const color of EXAM_COLORS) for (const [background, ink] of [[color.fill, color.ink], [color.dark, color.darkInk]]) {
    const values = [luminance(background), luminance(ink)].sort((a, b) => b - a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${background} / ${ink}`);
  }
});
console.log(`\n${passed} exam overview checks passed.`);
