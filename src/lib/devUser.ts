import { prisma } from "./db";

/**
 * Stand-in for real auth (Supabase comes later). Returns a stable local user so
 * the whole app is usable offline. When auth lands, replace calls to this with
 * the session user id — nothing else needs to change.
 */
const DEV_EMAIL = "dev@studyflow.local";

// The dev user's id never changes once created, but the upsert below takes
// SQLite's write lock on EVERY request (each page render serializes against
// real mutations). Memoize the id per process in production; dev/tests keep
// the exact upsert behaviour (test DBs get reset between runs).
let cachedDevUserId: string | null = null;

export async function getCurrentUserId(): Promise<string> {
  if (process.env.NODE_ENV === "production" && cachedDevUserId) return cachedDevUserId;
  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: "Dev Student" },
    select: { id: true },
  });
  cachedDevUserId = user.id;
  return user.id;
}

/**
 * Returns the current user's secret calendar-subscribe token, generating and
 * persisting a URL-safe random one on first use. Used to build the webcal feed.
 */
export async function getCalendarToken(): Promise<string> {
  const userId = await getCurrentUserId();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { calendarToken: true },
  });
  if (user.calendarToken) return user.calendarToken;

  const token = crypto.randomUUID();
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return token;
}
