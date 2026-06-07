// Shared iCalendar (.ics) builder. Used by the one-time download route
// (/api/calendar) and the live subscribe feed (/api/calendar/[token]).

/** Escape a value for an iCalendar text field (RFC 5545). */
function ics(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, " ");
}

/** Minimal shape this builder needs from a StudyBlock (plus its course name). */
export type CalendarBlock = {
  date: Date;
  minutes: number;
  topicTitle: string;
  kind: string;
  course: { name: string };
};

/**
 * Build an .ics calendar string from study/review blocks. Each day's sessions
 * are laid back-to-back starting at 09:00 (floating local time).
 */
export function buildCalendar(blocks: CalendarBlock[]): string {
  const byDate = new Map<string, CalendarBlock[]>();
  for (const b of blocks) {
    const d = b.date.toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(b);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyFlow//EN",
    "CALSCALE:GREGORIAN",
  ];
  const hhmm = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}${String(mins % 60).padStart(2, "0")}00`;
  let uid = 0;

  for (const [d, dayBlocks] of byDate) {
    const dt = d.replace(/-/g, "");
    let cursor = 9 * 60; // 09:00
    for (const b of dayBlocks) {
      const startM = cursor;
      const endM = Math.min(cursor + b.minutes, 23 * 60 + 59);
      cursor = endM;
      const label = b.kind === "review" ? `🔁 Review: ${b.topicTitle}` : `📚 ${b.topicTitle}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:sf-${uid++}-${dt}@studyflow`,
        `DTSTAMP:${dt}T090000`,
        `DTSTART:${dt}T${hhmm(startM)}`,
        `DTEND:${dt}T${hhmm(endM)}`,
        `SUMMARY:${ics(`${label} (${b.course.name})`)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}
