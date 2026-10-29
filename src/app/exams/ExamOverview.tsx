"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/components/i18n/I18nProvider";
import { iconButtonClass } from "@/components/ui";
import type { RemainingExam } from "@/lib/examSyncTypes";
import { calendarMonthDays, examDay, examOverviewMonths, examTimelineLayout, upcomingExamDays, type ExamColor } from "@/lib/examOverview";
import styles from "./ExamOverview.module.css";

export function examColorStyle(color: ExamColor): CSSProperties {
  return { "--exam-fill": color.fill, "--exam-ink": color.ink, "--exam-dark": color.dark, "--exam-dark-ink": color.darkInk } as CSSProperties;
}

export function ExamColorKey({ color }: { color: ExamColor }) {
  return <span className={styles.key} style={examColorStyle(color)} aria-hidden="true" />;
}

export default function ExamOverview({ courses, today, colors, onSelectDate }: {
  courses: RemainingExam[]; today: string; colors: Map<string, ExamColor>; onSelectDate: (date: string) => void;
}) {
  const t = useT();
  const months = examOverviewMonths(courses, today);
  if (!months.length) return null;
  return <section className="mt-5" aria-label={t("exams.overview.title")} data-exam-overview>
    <ExamTimeline courses={courses} today={today} colors={colors} />
    <MonthRail key={`${months[0]}-${months.at(-1)}`} months={months} days={upcomingExamDays(courses, today)} today={today} colors={colors} onSelectDate={onSelectDate} />
  </section>;
}

function ExamTimeline({ courses, today, colors }: { courses: RemainingExam[]; today: string; colors: Map<string, ExamColor> }) {
  const t = useT();
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const layout = examTimelineLayout(courses, today, width);
  if (!layout) return null;
  const shortDate = new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const formatDate = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));
  const summary = t.n("exams.overview.summary", layout.points.reduce((sum, point) => sum + point.exams.length, 0), { first: formatDate(layout.points[0].date), last: formatDate(layout.points.at(-1)!.date) });
  const gaps = layout.points.slice(1).map((point, index) => ({ from: layout.points[index], to: point, days: examDay(point.date) - examDay(layout.points[index].date) }));
  const minimumGap = Math.min(...gaps.map((gap) => gap.days));
  return <div ref={host} className="mb-4 w-full" data-exam-timeline>
    <svg viewBox={`0 0 ${width} ${layout.height}`} width="100%" height={layout.height} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{t("exams.overview.timeline")}</title><desc id={`${id}-description`}>{summary}</desc>
      <line x1={16} x2={width - 16} y1={layout.baseline} y2={layout.baseline} className={styles.line} />
      {layout.ticks.map((tick) => <g key={tick.date}>
        <line x1={tick.x} x2={tick.x} y1={layout.baseline - 5} y2={layout.baseline + 5} className={styles.tick} />
        <text x={tick.x} y={layout.baseline + 49} textAnchor="middle" className={styles.axis}>{formatDate(tick.date)}</text>
      </g>)}
      {layout.clusters.map((cluster) => {
        const y = 16 + cluster.lane * 34;
        return <polyline key={cluster.dates[0].date} points={`${cluster.labelX},${y + 22} ${cluster.x},${y + 30} ${cluster.x},${layout.baseline - 8}`} fill="none" className={styles.line} />;
      })}
      {layout.clusters.map((cluster) => {
        const exams = cluster.dates.flatMap((day) => day.exams);
        const words = exams[0].name.trim().split(/\s+/);
        const suffix = /^(?:[IVX]+|\d+)$/u.test(words.at(-1)!) ? ` ${words.at(-1)}` : "";
        const shortName = words.length <= 2 && exams[0].name.length <= 15 ? exams[0].name : `${words[0]}${suffix}`;
        const name = exams.length === 1 ? shortName : t.n("exams.overview.exams", exams.length);
        const first = cluster.dates[0].date;
        const last = cluster.dates.at(-1)!.date;
        const y = 16 + cluster.lane * 34;
        return <g key={first} data-timeline-cluster>
          <rect x={cluster.labelX - 52} y={y - 16} width={104} height={36} className={styles.labelBackground} />
          <foreignObject x={cluster.labelX - 48} y={y - 15} width={96} height={20}>
            <div className="truncate text-center text-[13px] font-medium leading-[18px] text-foreground" title={name}>{name}</div>
          </foreignObject>
          <text x={cluster.labelX} y={y + 16} textAnchor="middle" className={styles.axis}>{first === last ? formatDate(first) : first.slice(0, 7) === last.slice(0, 7) ? `${Number(first.slice(8))}–${formatDate(last)}` : `${formatDate(first)}–${formatDate(last)}`}</text>
        </g>;
      })}
      {layout.points.map((point) => <g key={point.date} data-timeline-date={point.date}>
        {point.exams.slice(0, 3).map((exam, index) => <circle key={exam.id} cx={point.x} cy={layout.baseline - index * 5} r={6} className={styles.point} style={examColorStyle(colors.get(exam.id)!)} />)}
      </g>)}
      {gaps.filter((gap) => gap.to.x - gap.from.x >= 68 || (gap.days === minimumGap && gaps.length <= 4)).map((gap) => <g key={gap.to.date}>
        {gap.to.x - gap.from.x > 10 && <line x1={gap.from.x + 5} x2={gap.to.x - 5} y1={layout.baseline + 14} y2={layout.baseline + 14} className={styles.tick} />}
        <text x={Math.max(38, Math.min(width - 38, (gap.from.x + gap.to.x) / 2))} y={layout.baseline + 29} textAnchor="middle" className={styles.gap}>{t.n("exams.overview.days", gap.days)}</text>
      </g>)}
    </svg>
  </div>;
}

function MonthRail({ months, days, today, colors, onSelectDate }: {
  months: string[]; days: ReturnType<typeof upcomingExamDays>; today: string; colors: Map<string, ExamColor>; onSelectDate: (date: string) => void;
}) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [bounds, setBounds] = useState({ start: true, end: false });
  const rail = useRef<HTMLDivElement>(null);
  const dates = new Map(days.map((day) => [day.date, day.exams]));
  const monthFormat = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(t.locale, { dateStyle: "full", timeZone: "UTC" });
  const weekdayFormat = new Intl.DateTimeFormat(t.locale, { weekday: "short", timeZone: "UTC" });
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormat.format(new Date(`2024-01-0${index + 1}T00:00:00Z`)));
  const monthName = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
  function goTo(index: number) {
    const container = rail.current;
    const element = container?.children[Math.max(0, Math.min(months.length - 1, index))] as HTMLElement | undefined;
    if (!element || !container) return;
    const first = container.children[0] as HTMLElement;
    const vertical = getComputedStyle(container).flexDirection === "column";
    container.scrollTo({
      top: vertical ? element.offsetTop - first.offsetTop : 0,
      left: vertical ? 0 : element.offsetLeft - first.offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }
  const onScroll = useCallback(() => {
    const container = rail.current;
    if (!container || !container.children.length) return;
    const vertical = getComputedStyle(container).flexDirection === "column";
    const position = vertical ? container.scrollTop : container.scrollLeft;
    const first = container.children[0] as HTMLElement;
    const origin = vertical ? first.offsetTop : first.offsetLeft;
    const distances = Array.from(container.children, (child) => Math.abs(position - ((vertical ? (child as HTMLElement).offsetTop : (child as HTMLElement).offsetLeft) - origin)));
    setActive(distances.indexOf(Math.min(...distances)));
    const start = position < 2;
    const end = position + (vertical ? container.clientHeight : container.clientWidth) >= (vertical ? container.scrollHeight : container.scrollWidth) - 2;
    setBounds((previous) => previous.start === start && previous.end === end ? previous : { start, end });
  }, []);
  useEffect(() => {
    if (!rail.current) return;
    const observer = new ResizeObserver(onScroll);
    observer.observe(rail.current);
    return () => observer.disconnect();
  }, [onScroll]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const vertical = getComputedStyle(event.currentTarget).flexDirection === "column";
    const next = event.key === (vertical ? "ArrowDown" : "ArrowRight") ? active + 1 : event.key === (vertical ? "ArrowUp" : "ArrowLeft") ? active - 1 : event.key === "Home" ? 0 : event.key === "End" ? months.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    goTo(next);
  }
  return <div className="relative border-t border-border pt-3" data-exam-calendar data-active-month={months[active]}>
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 hidden justify-between gap-2 sm:flex">
      <button type="button" disabled={bounds.start} onClick={() => goTo(active - 1)} aria-label={t("exams.overview.previousMonth")} className={iconButtonClass("pointer-events-auto inline-flex items-center justify-center bg-background disabled:opacity-30")}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
      <button type="button" disabled={bounds.end} onClick={() => goTo(active + 1)} aria-label={t("exams.overview.nextMonth")} className={iconButtonClass("pointer-events-auto inline-flex items-center justify-center bg-background disabled:opacity-30")}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
    </div>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{monthName(months[active])}</p>
    <div ref={rail} className={`${styles.rail} -mx-4 relative`} onScroll={onScroll} onKeyDown={keyboard} tabIndex={0} role="region" aria-label={t("exams.overview.months")}>
      {months.map((month) => <div key={month} className={styles.month} data-exam-month={month}>
        <h2 className="flex min-h-11 items-center justify-center px-2 text-center text-lg font-semibold sm:px-11">{monthName(month)}</h2>
        <table className={styles.table}>
          <caption className="sr-only">{monthName(month)}</caption>
          <thead><tr>{weekdays.map((weekday, day) => <th key={day} scope="col">{weekday}</th>)}</tr></thead>
          <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{calendarMonthDays(month).slice(week * 7, week * 7 + 7).map((date, column) => {
            if (!date) return <td key={column} aria-hidden="true" />;
            const exams = dates.get(date) ?? [];
            const value = Number(date.slice(8));
            const content = <span className={styles.date}>
              <time dateTime={date}>{value}</time>
              {exams.length > 1 && <><span className={styles.count} aria-hidden="true">{exams.length}</span><span className={styles.dots} aria-hidden="true">{exams.slice(0, 3).map((exam) => <span key={exam.id} className={styles.dot} style={examColorStyle(colors.get(exam.id)!)} />)}</span></>}
            </span>;
            const cls = `${styles.day} ${date === today ? styles.today : ""} ${exams.length ? styles.event : ""} ${exams.length > 1 ? styles.multiple : ""}`;
            return <td key={column}>{exams.length ? <button type="button" data-exam-date={date} className={cls} style={examColorStyle(colors.get(exams[0].id)!)} onClick={() => onSelectDate(date)}
              aria-label={`${fullDate.format(new Date(`${date}T00:00:00Z`))}: ${exams.map((exam) => exam.name).join(", ")}`} aria-current={date === today ? "date" : undefined}>{content}</button>
              : <span className={cls} aria-current={date === today ? "date" : undefined}>{content}</span>}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>)}
    </div>
  </div>;
}
