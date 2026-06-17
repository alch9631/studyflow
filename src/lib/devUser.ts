import type { Session } from "next-auth";
import { prisma } from "./db";
import { auth } from "@/auth";

/**
 * Resolves the current user's id for every userId-scoped read/write.
 *
 * Real auth (Auth.js / Google) is the primary path: if there's an authenticated
 * session, its database user id is returned. When there is NO session we fall
 * back to the legacy dev user — but ONLY when ALLOW_DEV_USER=1 is set, so local
 * dev and the Pi keep working with no Google credentials. In production (no dev
 * flag) an unauthenticated request throws; the middleware redirects to /login
 * before any page reaches this, so that throw is a defensive last resort.
 */
const DEV_EMAIL = "dev@studyflow.local";

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
  const devAllowed = process.env.ALLOW_DEV_USER === "1";

  // Resolve the real session. In dev-user mode we tolerate failures (e.g. auth()
  // called outside a request scope in unit tests, or no AUTH_SECRET configured)
  // and fall through to the dev user; in production a broken session is fatal.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (err) {
    if (!devAllowed) throw err;
  }

  if (session?.user?.id) return session.user.id;
  if (devAllowed) return getDevUserId();
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
