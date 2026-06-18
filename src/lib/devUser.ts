import { prisma } from "./db";

/**
 * Resolves the current user's id for every userId-scoped read/write.
 *
 * There are exactly three auth modes, branched on FIRST so we never call auth()
 * (and so never hit an *expected* "headers outside request scope" throw or an
 * expected missing-session error) in a path where the dev user is the intended
 * answer:
 *
 *   - test (NODE_ENV=test): always the seeded dev user, silently. Unit/route
 *     tests import getCurrentUserId() outside any request scope, so auth() would
 *     throw by design — we don't call it.
 *   - dev (non-production, or ALLOW_DEV_USER=1): the seeded dev user. Covers a
 *     clean `git clone && npm install && npm run dev`/`npm test` with no env
 *     flags, and the Pi running NODE_ENV=production with no Google creds but
 *     ALLOW_DEV_USER=1 set. No auth() call, no noisy logs.
 *   - production (default, no ALLOW_DEV_USER): a real Auth.js session is
 *     REQUIRED. Only here do we call auth(); a missing session throws (the proxy
 *     redirects to /login first, so that throw is a defensive last resort).
 */
const DEV_EMAIL = "dev@studyflow.local";

type AuthMode = "test" | "dev" | "production";

/**
 * Decide the auth mode for this process/request. Order matters: test is checked
 * before dev so it stays silent and never touches auth(); dev covers every other
 * non-production case plus the explicit ALLOW_DEV_USER opt-in; everything else
 * is strict production.
 */
function authMode(): AuthMode {
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_USER === "1") {
    return "dev";
  }
  return "production";
}

// The dev user's id never changes once created, but the upsert below takes
// SQLite's write lock on EVERY request (each page render serializes against
// real mutations). Memoize the id per process in production; dev/tests keep
// the exact upsert behaviour (test DBs get reset between runs).
let cachedDevUserId: string | null = null;

/** Ensure-and-return the seeded local dev user (legacy no-auth behaviour). */
async function getDevUserId(): Promise<string> {
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

export async function getCurrentUserId(): Promise<string> {
  // Branch on the mode FIRST. test/dev resolve the seeded dev user without ever
  // calling auth() — so an *expected* "headers outside request scope" throw (in
  // tests) or a missing session (in dev) is never part of the control flow.
  if (authMode() !== "production") return getDevUserId();

  // Production: a real Auth.js session is required. We only reach auth() here,
  // where a thrown error or a missing session is a genuine failure — not the
  // expected dev/test path — so it must propagate.
  const { auth } = await import("@/auth");
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  throw new Error("Not authenticated");
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
