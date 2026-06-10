"use client";

import dynamic from "next/dynamic";

/**
 * Lazy wrappers for the Insights charts so the heavy `recharts` bundle is NOT in
 * the initial page payload — it's fetched on demand, client-side only. A small
 * skeleton holds the space so deferring the chart doesn't shift layout.
 *
 * `ssr: false` is allowed here because this is a client module; the (server)
 * Insights page imports these wrappers instead of the real components.
 */
function ChartSkeleton({ className = "h-48" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 ${className}`}
    />
  );
}

export const WeeklyActivityChart = dynamic(
  () => import("./InsightsCharts").then((m) => m.WeeklyActivityChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const ConsistencyGauge = dynamic(
  () => import("./InsightsCharts").then((m) => m.ConsistencyGauge),
  { ssr: false, loading: () => <ChartSkeleton className="h-40" /> },
);

export const GradeTrendChart = dynamic(
  () => import("./InsightsCharts").then((m) => m.GradeTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
