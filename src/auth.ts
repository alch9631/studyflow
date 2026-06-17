import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

/**
 * Auth.js (NextAuth v5) configuration. Google is the only provider; it's wired
 * up purely from env (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET) so the app builds and
 * runs even when no credentials are set — sign-in just won't work until they are
 * (local dev + the Pi use ALLOW_DEV_USER=1 instead; see src/lib/devUser.ts).
 *
 * The PrismaAdapter persists users/accounts/sessions into our existing DB, so a
 * Google user becomes a real `User` row that every userId-scoped read already
 * understands. We use database sessions (the adapter default), and the session
 * callback copies the user's id onto `session.user.id` for getCurrentUserId().
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Expose the database user id on the session so server code can scope reads.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
