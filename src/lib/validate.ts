/**
 * Shared input-validation helpers for server actions and API routes.
 *
 * Centralizes the (previously inline) "date-reject" pattern and the rest of the
 * sanitize/validate logic so every entry point that takes user input behaves
 * consistently. Dependency-free so it's safe to import anywhere on the server.
 *
 * Convention:
 *  - `requireX` / `parseX` THROW `ValidationError` on bad input (caller may let
 *    Next surface it, or catch + redirect with a ?msg=... like the rest of the app).
 *  - `parseX` (no `require`) return `null` when the value is absent/blank so the
 *    caller can decide whether the field is optional.
 */

/** Thrown when user input fails validation. Carries a human-readable message. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const MAX_TEXT = 200_000; // generous cap for pasted syllabi / module text

/**
 * Per-topic title cap, shared by every path that creates topics (pasted lines,
 * AI-extracted syllabi/analyses). Titles are denormalized into every
 * StudyBlock.topicTitle and the ICS export, so one unbounded line would be
 * copied into every scheduled session.
 */
export const MAX_TOPIC_TITLE_LENGTH = 300;

/** Trim a FormData/body string field; returns "" when missing. */
export function str(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Required, trimmed, length-bounded string. Throws if empty or absurdly long.
 * Use for names, titles, etc. `max` defaults to a sane DB-row size.
 */
export function requireText(
  value: FormDataEntryValue | null | undefined,
  label: string,
  max = 2000,
): string {
  const s = str(value);
  if (!s) throw new ValidationError(`${label} is required.`);
  if (s.length > max) throw new ValidationError(`${label} is too long.`);
  return s;
}

/** Optional, trimmed, length-bounded string. Returns null when blank. */
export function optionalText(
  value: FormDataEntryValue | null | undefined,
  max = 2000,
): string | null {
  const s = str(value);
  if (!s) return null;
  if (s.length > max) throw new ValidationError("Text is too long.");
  return s;
}

/** Long free text (pasted syllabus / extracted file). Returns "" when blank. */
export function longText(value: FormDataEntryValue | null | undefined): string {
  const s = str(value);
  if (s.length > MAX_TEXT) throw new ValidationError("That text is too large to process.");
  return s;
}

/**
 * Required identifier (cuid / token from a hidden field). Bounded so a junk
 * value can't reach Prisma. Throws when missing.
 */
export function requireId(
  value: FormDataEntryValue | null | undefined,
  label = "Record",
): string {
  const s = str(value);
  if (!s) throw new ValidationError(`${label} id is required.`);
  if (s.length > 200) throw new ValidationError(`Invalid ${label.toLowerCase()} id.`);
  return s;
}

/** Optional identifier (e.g. an attached courseId). Returns null when blank. */
export function optionalId(value: FormDataEntryValue | null | undefined): string | null {
  const s = str(value);
  if (!s) return null;
  if (s.length > 200) throw new ValidationError("Invalid id.");
  return s;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Is `iso` a real YYYY-MM-DD calendar date? */
export function isValidISODate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip guard: Date rolls impossible days over (2025-02-30 → Mar 2), so
  // require the parsed instant to render back to the exact same calendar day.
  return d.toISOString().slice(0, 10) === iso;
}

/**
 * How far into the future a user-supplied date may lie. Every date the app
 * accepts (exam dates, due dates, block days) drives day-by-day scheduling, so
 * an unbounded value like 9999-12-31 would trigger massive date enumeration
 * downstream. ~2 years comfortably covers any real degree planning horizon.
 */
export const MAX_DATE_YEARS_AHEAD = 2;

/** Latest acceptable ISO date: `todayISO` shifted MAX_DATE_YEARS_AHEAD years. */
export function maxFutureISO(todayISO: string): string {
  return `${Number(todayISO.slice(0, 4)) + MAX_DATE_YEARS_AHEAD}${todayISO.slice(4)}`;
}

/**
 * The canonical "date-reject" check. Validates a YYYY-MM-DD field:
 *  - throws if blank (when required) or malformed
 *  - throws if it's before `todayISO` and `allowPast` is false
 *  - throws if it's more than {@link MAX_DATE_YEARS_AHEAD} years ahead
 * Returns the ISO string (caller turns it into a UTC Date with `+"T00:00:00Z"`).
 */
export function requireDate(
  value: FormDataEntryValue | null | undefined,
  label: string,
  todayISO: string,
  opts: { allowPast?: boolean } = {},
): string {
  const iso = str(value);
  if (!iso) throw new ValidationError(`${label} is required.`);
  if (!isValidISODate(iso)) throw new ValidationError(`Invalid ${label.toLowerCase()}.`);
  if (!opts.allowPast && iso < todayISO) {
    throw new ValidationError(`${label} can't be in the past.`);
  }
  if (iso > maxFutureISO(todayISO)) {
    throw new ValidationError(`${label} is too far in the future.`);
  }
  return iso;
}

/** Optional date field. Returns null when blank; otherwise validates as above. */
export function optionalDate(
  value: FormDataEntryValue | null | undefined,
  label: string,
  todayISO: string,
  opts: { allowPast?: boolean } = {},
): string | null {
  const iso = str(value);
  if (!iso) return null;
  return requireDate(value, label, todayISO, opts);
}

/** Convert a validated ISO date string to a UTC midnight Date. */
export function toUTCDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

/** Parse "HH:MM" into minutes-from-midnight; null if unparseable/out of range. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Weekday 0–6 (0=Sun … 6=Sat). Throws otherwise. */
export function requireWeekday(value: FormDataEntryValue | null | undefined): number {
  const n = parseInt(str(value), 10);
  if (Number.isNaN(n) || n < 0 || n > 6) throw new ValidationError("Invalid weekday.");
  return n;
}

/**
 * Sanitize a studyDays CSV ("1,2,3,4,5") to a clean, de-duped, sorted list of
 * 0–6 values. Falls back to the default Mon–Fri when nothing valid is given.
 */
export function sanitizeStudyDays(values: string[], fallback = "1,2,3,4,5"): string {
  const days = values
    .flatMap((v) => String(v).split(","))
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const uniq = [...new Set(days)].sort((a, b) => a - b);
  return uniq.length > 0 ? uniq.join(",") : fallback;
}

/** Clamp an integer field to [min, max], using `dflt` when blank/NaN. */
export function clampInt(
  value: FormDataEntryValue | null | undefined,
  min: number,
  max: number,
  dflt: number,
): number {
  const n = parseInt(str(value), 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

/**
 * Parse an optional grade in [min, max] (German scale 1.0–5.0). Accepts comma
 * decimals. Returns null only when blank (an intentional clear); throws
 * ValidationError when a value is present but unparseable or out of range, so
 * a typo (e.g. "6") is rejected instead of silently wiping the stored grade.
 */
export function parseGrade(
  value: FormDataEntryValue | null | undefined,
  min = 1,
  max = 5,
): number | null {
  const raw = str(value).replace(",", ".");
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < min || n > max) {
    throw new ValidationError(`Grade must be between ${min} and ${max}.`);
  }
  return n;
}

// ── Payload size guards (API request bodies) ────────────────────────────────
// Defensive limits for raw HTTP bodies, so an oversized payload is rejected
// BEFORE it's parsed/written. Reused by API routes via apiError's handler.

/**
 * Reject a raw request body that's larger than `maxBytes`. Uses the
 * Content-Length header when present (cheap, no read), and is also safe to call
 * with an already-read body string. Throws `ValidationError` on breach.
 *
 * Note: Content-Length can be spoofed/absent, so routes should ALSO bound the
 * decoded text (see `guardTextSize`) — this just catches the obvious cases early.
 */
export function guardContentLength(req: Request, maxBytes: number): void {
  const header = req.headers.get("content-length");
  if (header) {
    const len = Number(header);
    if (Number.isFinite(len) && len > maxBytes) {
      throw new ValidationError("Request body is too large.");
    }
  }
}

/** Reject an already-read body/text whose byte length exceeds `maxBytes`. */
export function guardTextSize(text: string, maxBytes: number): void {
  // Byte length (UTF-8), not char count — matches what was actually sent.
  const bytes = typeof Buffer !== "undefined"
    ? Buffer.byteLength(text, "utf8")
    : new TextEncoder().encode(text).length;
  if (bytes > maxBytes) {
    throw new ValidationError("Request body is too large.");
  }
}

/**
 * Read a JSON request body with a size cap. Rejects (ValidationError) when the
 * declared Content-Length or the decoded text exceeds `maxBytes`, and when the
 * body isn't valid JSON. One call replaces the inline `try { req.json() }`
 * pattern while adding the size guard.
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes: number,
): Promise<T> {
  guardContentLength(req, maxBytes);
  const text = await req.text();
  guardTextSize(text, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError("Invalid JSON body.");
  }
}

/**
 * Validate a required, length-bounded string from a parsed (JSON) body — the
 * body-side counterpart to `requireText`, which works on FormData. Throws when
 * missing, not a string, or longer than `max`.
 */
export function requireBodyString(
  value: unknown,
  label: string,
  max: number,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  if (value.length > max) throw new ValidationError(`${label} is too long.`);
  return value;
}
