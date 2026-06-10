// Shared iCalendar (.ics) builder. Used by the one-time download route
// (/api/calendar) and the live subscribe feed (/api/calendar/[token]).

const encoder = new TextEncoder();

/**
 * Escape a value for an iCalendar TEXT field (RFC 5545 §3.3.11). Backslash must
 * be doubled first; then `;` `,` and any line break are escaped. A bare CR or
 * LF inside a value would otherwise inject a phantom content line — they fold to
 * the literal `\n` escape.
 */
function ics(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line to ≤75 octets per RFC 5545 §3.1. Continuation lines begin
 * with a single space (which counts toward the 75). Folding only happens on
 * code-point boundaries, so a multi-octet UTF-8 sequence is never split and
 * unfolding (removing every CRLF+space) restores the exact original line.
 */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75; // continuation lines spend 1 octet on the leading space → 74
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (curBytes + chBytes > limit) {
      out.push(cur);
      cur = ch;
      curBytes = chBytes;
      limit = 74;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  out.push(cur);
  return out.join("\r\n ");
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
        `DTSTAMP:${dt}T090000Z`,
        `DTSTART:${dt}T${hhmm(startM)}`,
        `DTEND:${dt}T${hhmm(endM)}`,
        `SUMMARY:${ics(`${label} (${b.course.name})`)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n");
}
