// Auth.js (NextAuth v5) catch-all route. Exposes the OAuth sign-in / callback /
// sign-out endpoints under /api/auth/*; all logic lives in src/auth.ts.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
