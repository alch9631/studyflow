"use client";

// Data-viz for the Insights page. These are the only interactive charts in the
// app, so they live in one client island the (server) page can drop in: the
// 7-day study-activity bars and the 14-day consistency gauge. Colors come from
// the shared `--chart-*` tokens (globals.css) so both themes stay on-brand.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { useT } from "./i18n/I18nProvider";
import type { Translator } from "./i18n/messages";

/** Same h/m formatting the Insights page uses, so chart labels read identically. */
function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Calm, fixed-height stand-in shown instead of a chart when there's nothing to
 * plot — keeps the panel from collapsing and stops recharts from measuring an
 * empty container.
 */
function ChartPlaceholder({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex w-full items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 ${className}`}
    >
      {children}
    </div>
  );
}

export type DayPoint = { label: string; min: number; full: string };

/** Tooltip card — Tailwind-styled so it matches the app's surfaces in both themes. */
function ActivityTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: { payload: DayPoint }[];
  t: Translator;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="font-medium">{d.full}</div>
      <div className="mt-0.5 text-gray-500 dark:text-gray-400">
        {d.min > 0
          ? t("insights.chartStudiedSuffix", { time: fmtMin(d.min) })
          : t("insights.chartNoStudyLogged")}
      </div>
    </div>
  );
}

/**
 * Last-7-days completed study minutes as a bar chart with hover/focus tooltips.
 * Replaces the hand-rolled div bars: same brand fill, but real axis labels,
 * a value tooltip, and empty days rendered as a faint placeholder bar.
 */
export function WeeklyActivityChart({ data }: { data: DayPoint[] }) {
  const t = useT();
  const total = data.reduce((s, d) => s + d.min, 0);
  // No completed minutes anywhere → there's nothing to plot. Render a calm,
  // fixed-height placeholder instead of an empty chart (which makes recharts'
  // ResponsiveContainer warn about an "invalid container size").
  if (data.length === 0 || total === 0) {
    return (
      <figure className="m-0">
        <ChartPlaceholder className="h-28">{t("insights.chartNoneLast7")}</ChartPlaceholder>
      </figure>
    );
  }
  return (
    <figure className="m-0">
      <div className="h-28 w-full" role="img" aria-label={t("insights.chartWeeklyAria")}>
        {/* Explicit numeric height + min-dimensions keep ResponsiveContainer from
            measuring a 0×0 parent during the lazy mount and warning. */}
        <ResponsiveContainer width="100%" height={112} minWidth={0} minHeight={112}>
          <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
              dy={4}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              content={<ActivityTooltip t={t} />}
              cursor={{ fill: "var(--chart-grid)" }}
            />
            <Bar dataKey="min" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.min > 0 ? "var(--chart-series)" : "var(--chart-track)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * 14-day consistency as a radial gauge — surfaces the already-computed
 * consistency score (share of the last 14 days with ≥1 completed block) as a
 * single at-a-glance arc, with the active-day count called out in the center.
 */
export function ConsistencyGauge({
  consistency,
  activeDays,
}: {
  consistency: number;
  activeDays: number;
}) {
  const t = useT();
  const data = [{ name: "consistency", value: consistency }];
  return (
    <div className="relative mx-auto h-40 w-40">
      <div
        className="h-full w-full"
        role="img"
        aria-label={t("insights.chartConsistencyAria", { pct: consistency, days: activeDays })}
      >
        {/* Fixed 160×160 host (h-40 w-40) — give the container explicit numeric
            dimensions so it never measures a 0×0 parent mid-mount. */}
        <ResponsiveContainer width={160} height={160} minWidth={0} minHeight={160}>
          <RadialBarChart
            data={data}
            startAngle={225}
            endAngle={-45}
            innerRadius="72%"
            outerRadius="100%"
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              dataKey="value"
              angleAxisId={0}
              cornerRadius={999}
              background={{ fill: "var(--chart-track)" }}
              fill="var(--chart-series)"
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{consistency}%</span>
        <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {t("insights.chartDaysActive", { days: activeDays })}
        </span>
      </div>
    </div>
  );
}

export type GradePoint = { label: string; grade: number; running: number; full: string };

/**
 * Tooltip for the grade trend — course name, its own grade, and the running
 * Notenschnitt after that exam, both on the German scale.
 */
function GradeTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: { payload: GradePoint }[];
  t: Translator;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="font-medium">{d.full}</div>
      <div className="mt-0.5 text-gray-500 dark:text-gray-400">
        {t("insights.chartGrade", { grade: d.grade.toFixed(1) })}
      </div>
      <div className="text-gray-500 dark:text-gray-400">
        {t("insights.chartAvgSoFar", { avg: d.running.toFixed(2) })}
      </div>
    </div>
  );
}

/** Tiny inline legend swatch for the two grade-trend series. */
function GradeLegend({ t }: { t: Translator }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: "var(--chart-series)" }} />
        {t("insights.chartLegendPerCourse")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-0.5 w-3.5 rounded-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, var(--chart-series-2) 0 4px, transparent 4px 7px)",
          }}
        />
        {t("insights.chartLegendRunningAvg")}
      </span>
    </div>
  );
}

/**
 * Grade trend as a line chart — graded courses plotted in exam-date order so the
 * student can see whether their Notenschnitt is drifting up or down over time.
 * The brand-blue line is each course's own grade; the amber dashed line is the
 * running LP-weighted average after each exam, so the GPA's drift is visible
 * directly. The Y axis is reversed (1.0 sits at the top) so an upward line reads
 * as "grades improving". Needs ≥2 graded courses to be meaningful; the page
 * gates on that.
 */
export function GradeTrendChart({
  data,
  average,
}: {
  data: GradePoint[];
  average: number;
}) {
  const t = useT();
  return (
    <figure className="m-0">
      <div
        className="h-36 w-full"
        role="img"
        aria-label={t("insights.chartGradeTrendAria", {
          count: data.length,
          avg: average.toFixed(2),
        })}
      >
        {/* Explicit numeric height + min-dimensions avoid the 0×0 mount warning. */}
        <ResponsiveContainer width="100%" height={144} minWidth={0} minHeight={144}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
              dy={4}
              interval="preserveStartEnd"
            />
            <YAxis
              reversed
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
              width={28}
            />
            <Tooltip content={<GradeTooltip t={t} />} cursor={{ stroke: "var(--chart-grid)" }} />
            <Line
              type="monotone"
              dataKey="running"
              stroke="var(--chart-series-2)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="grade"
              stroke="var(--chart-series)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--chart-series)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <GradeLegend t={t} />
      <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
        Grade over time (1.0 best). The amber line is your running {average.toFixed(2)} average.
      </figcaption>
    </figure>
  );
}
