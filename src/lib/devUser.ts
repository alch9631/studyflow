import { prisma } from "./db";

/**
 * Stand-in for real auth (Supabase comes later). Returns a stable local user so
 * the whole app is usable offline. When auth lands, replace calls to this with
 * the session user id — nothing else needs to change.
 */
const DEV_EMAIL = "dev@studyflow.local";

export async function getCurrentUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: "Dev Student" },
  });
  return user.id;
}
