import Link from "next/link";
import type { UnscheduledWork } from "@/lib/planService";

export default function UnscheduledWorkList({ items, de }: { items: (UnscheduledWork & { courseId: string })[]; de: boolean }) {
  if (!items.length) return null;
  const grouped = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const key = `${item.courseId}|${item.topicId}|${item.kind}|${item.reason}`;
    const previous = grouped.get(key);
    grouped.set(key, { ...item, minutes: item.minutes + (previous?.minutes ?? 0) });
  }
  const reasons = de ? { capacity: "Keine freie Lernzeit", prerequisite: "Wartet auf Voraussetzungen", deadline: "Frist prüfen" }
    : { capacity: "Needs more available time", prerequisite: "Waiting for prerequisites", deadline: "Check the deadline" };
  return <section className="my-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20" aria-label={de ? "Noch ohne Lerntag" : "Work awaiting a study day"}>
    <h2 className="font-semibold">{de ? "Noch ohne Lerntag" : "Work awaiting a study day"}</h2>
    <p className="mt-1 text-sm">{de ? "Diese Arbeit bleibt erhalten und ist nicht in den Kalender eingetragen." : "This work is kept and has not been added to your calendar."}</p>
    <ul className="mt-2 space-y-2 text-sm">{[...grouped.entries()].map(([key, item]) => <li key={key}>
      <Link className="font-medium underline underline-offset-4" href={`/courses/${item.courseId}#topic-${item.topicId}`}>{item.topicTitle}</Link>
      {" · "}{item.minutes} min{item.kind === "review" ? de ? " Wiederholung" : " review" : ""}{" · "}{reasons[item.reason]}
    </li>)}</ul>
  </section>;
}
