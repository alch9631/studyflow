"use client";

// Data-viz for the Insights page. These are the only interactive charts in the
// app, so they live in one client island the (server) page can drop in: the
// 7-day study-activity bars and the 14-day consistency gauge. Colors come from
// the shared `--chart-*` tokens (globals.css) so both themes stay on-brand.

import {
  Bar,
  BarChart,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Same h/m formatting the Insights page uses, so chart labels read identically. */
function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export type DayPoint = { label: string; min: number; full: string };

/** Tooltip card — Tailwind-styled so it matches the app's surfaces in both themes. */
function ActivityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DayPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="font-medium">{d.full}</div>
      <div className="mt-0.5 text-gray-500 dark:text-gray-400">
        {d.min > 0 ? `${fmtMin(d.min)} studied` : "No study logged"}
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
  const total = data.reduce((s, d) => s + d.min, 0);
  return (
    <figure className="m-0">
      <div className="h-28 w-full" role="img" aria-label="Study minutes completed over the last 7 days">
        <ResponsiveContainer width="100%" height="100%">
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
              content={<ActivityTooltip />}
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
      {total === 0 && (
        <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          No study logged in the last 7 days yet.
        </figcaption>
      )}
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
  const data = [{ name: "consistency", value: consistency }];
  return (
    <div className="relative mx-auto h-40 w-40">
      <div
        className="h-full w-full"
        role="img"
        aria-label={`Consistency ${consistency} percent — active on ${activeDays} of the last 14 days`}
      >
        <ResponsiveContainer width="100%" height="100%">
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
          {activeDays}/14 days active
        </span>
      </div>
    </div>
  );
}
