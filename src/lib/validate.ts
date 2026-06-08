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
  return !Number.isNaN(new Date(iso + "T00:00:00Z").getTime());
}

/**
 * The canonical "date-reject" check. Validates a YYYY-MM-DD field:
 *  - throws if blank (when required) or malformed
 *  - throws if it's before `todayISO` and `allowPast` is false
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
 * decimals. Returns null when blank OR out of range (clearing the grade).
 */
export function parseGrade(
  value: FormDataEntryValue | null | undefined,
  min = 1,
  max = 5,
): number | null {
  const raw = str(value).replace(",", ".");
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}
