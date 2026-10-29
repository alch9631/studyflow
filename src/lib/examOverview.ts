import type { RemainingExam } from "./examSyncTypes";

const DAY = 86_400_000;
export const EXAM_COLORS = [
  { fill: "#00b9cc", ink: "#04313a", dark: "#00b9cc", darkInk: "#04313a" },
  { fill: "#2864b4", ink: "#ffffff", dark: "#8bb6f2", darkInk: "#10203a" },
  { fill: "#7653b3", ink: "#ffffff", dark: "#c2a4ee", darkInk: "#24113e" },
  { fill: "#62718a", ink: "#ffffff", dark: "#b1bfd6", darkInk: "#172239" },
  { fill: "#18756d", ink: "#ffffff", dark: "#71ccba", darkInk: "#10332c" },
  { fill: "#95670f", ink: "#ffffff", dark: "#e5bb72", darkInk: "#392508" },
] as const;
export type ExamColor = (typeof EXAM_COLORS)[number];

export function examColorMap(courses: Pick<RemainingExam, "id">[]) {
  return new Map([...courses].sort((a, b) => a.id.localeCompare(b.id)).map((course, index) => [course.id, EXAM_COLORS[index % EXAM_COLORS.length]]));
}

export function examDay(iso: string): number {
  const value = Date.parse(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== iso) throw new Error("Invalid exam date");
  return value / DAY;
}

export function examISO(day: number) { return new Date(day * DAY).toISOString().slice(0, 10); }

export function shiftExamMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

/** Monday-first, fixed-height months prevent the rail jumping during a swipe. */
export function calendarMonthDays(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= end.getUTCDate() ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}

export function upcomingExamDays(courses: RemainingExam[], today: string) {
  const days = new Map<string, RemainingExam[]>();
  for (const course of courses) {
    if (course.currentDate < today) continue;
    days.set(course.currentDate, [...(days.get(course.currentDate) ?? []), course]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, exams]) => ({ date, exams }));
}

export function examOverviewMonths(courses: RemainingExam[], today: string) {
  const days = upcomingExamDays(courses, today);
  if (!days.length) return [];
  const first = days[0].date.slice(0, 7);
  const last = days.at(-1)!.date.slice(0, 7);
  const count = Math.max(3, (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(first.slice(5)) + 1);
  return Array.from({ length: count }, (_, index) => shiftExamMonth(first, index));
}

/** Points stay on their exact UTC date; only nearby text is grouped into callouts. */
export function examTimelineLayout(courses: RemainingExam[], today: string, width: number) {
  const days = upcomingExamDays(courses, today);
  if (!days.length) return null;
  const start = examDay(days[0].date) - 4;
  const end = examDay(days.at(-1)!.date) + 4;
  const left = 24;
  const right = Math.max(left + 1, width - 24);
  const x = (day: number) => left + (day - start) / (end - start) * (right - left);
  const points = days.map((day) => ({ ...day, x: x(examDay(day.date)) }));
  const clusters: { dates: typeof points; x: number; labelX: number; lane: number }[] = [];
  for (const point of points) {
    const previous = clusters.at(-1);
    if (days.length > 6 && previous && point.x - previous.dates.at(-1)!.x < 24 && point.x - previous.dates[0].x < 48) {
      previous.dates.push(point);
      previous.x = (previous.dates[0].x + point.x) / 2;
    } else clusters.push({ dates: [point], x: point.x, labelX: point.x, lane: 0 });
  }
  const lanes: number[] = [];
  for (const cluster of clusters) {
    cluster.labelX = Math.max(56, Math.min(width - 56, cluster.x));
    const from = cluster.labelX - 48;
    let lane = lanes.findIndex((last) => last + 8 <= from);
    if (lane < 0) lane = lanes.length;
    cluster.lane = lane;
    lanes[lane] = cluster.labelX + 48;
  }
  const baseline = 30 + lanes.length * 34;
  const ticks: { date: string; x: number }[] = [];
  if (end - start <= 45) {
    const stride = end - start <= 21 ? 7 : 14;
    for (let day = start; day <= end; day += stride) ticks.push({ date: examISO(day), x: x(day) });
  } else {
    const first = examISO(start).slice(0, 7);
    const monthCount = (new Date(end * DAY).getUTCFullYear() - Number(first.slice(0, 4))) * 12 + new Date(end * DAY).getUTCMonth() - (Number(first.slice(5)) - 1);
    const stride = Math.max(1, Math.ceil(monthCount / 4));
    for (let month = 0; month <= monthCount; month += stride) {
      const date = `${shiftExamMonth(first, month)}-01`;
      if (examDay(date) >= start) ticks.push({ date, x: x(examDay(date)) });
    }
  }
  return { points, clusters, ticks, baseline, height: baseline + 62, start, end };
}
