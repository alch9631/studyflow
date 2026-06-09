# Backend / Data Backlog

The BE builder drains this top-to-bottom. One item per cycle → one PR → auto-merge when green.
Format: `- [ ] item`. Controller flips to `- [x]` on merge. Feeders (security/research) append below.

- [x] Input validation hardening: every server action + API route (reuse date-reject pattern) — PR #11
- [x] More planService/engine edge-case tests (overlapping exams, zero-day, huge load) — PR #13
- [x] Consistent JSON error shape + error handling across API routes — PR #15
- [x] Performance: eliminate N+1 Prisma queries on /insights and /today — PR #17
- [x] Data export endpoint: JSON + CSV of courses, topics, progress — PR #18
- [x] Streak + study-time aggregation helpers with tests (if not covered by stats.ts) — PR #21
- [x] Defensive limits: max courses/topics per user, payload size guards — PR #23
- [x] Audit + tidy Prisma queries (select only needed fields)
- [x] Apply rate limiting (reuse rateLimit.ts) consistently to all mutating routes/actions
- [x] Validation coverage audit: ensure every API route + server action uses validate.ts
- [x] apiError coverage audit: ensure all routes return the standard error shape
- [x] Memoize/cache expensive stats & insights computations with tests
- [x] Timezone/day-boundary correctness pass in dates.ts with added tests
- [x] ics.ts & syllabus.ts edge-case test coverage
- [x] Bounded result sizes / pagination on any list-returning endpoints
- [x] Null/undefined defensive handling in planService/planner with tests

<!-- Critical-API-flow test hardening (user-requested 2026-06-08, vetted against codebase). NOTE: app has no real auth yet — getCurrentUserId() in devUser.ts returns a single dev user; Supabase auth is future work. So login/logout/unauthenticated-rejection tests are intentionally OUT OF SCOPE until auth lands. -->
- [x] Isolated test database for route/integration tests: the route-level tests (e.g. pushRoutes.test.ts) currently run against the real dev SQLite db (file:./dev.db) and mutate dev data. Add a dedicated throwaway test DB (e.g. DATABASE_URL=file:./test.db, migrated + reset per run) and a small test bootstrap helper that points tsx tests at it, so no test ever touches dev/prod data. Wire existing route tests to use it.
- [x] Cross-user data isolation tests for planService + course/topic/progress mutations: extend the ownership-scoping pattern already proven in blockService.test.ts / statsCache.test.ts. Seed two users (A and B), then assert every read/list/update/delete in planService and the course/topic/progress server actions is userId-scoped — user B can never read, mutate, or delete user A's rows (expect not-found/forbidden or empty, never cross-user bleed). This is the highest-value safety test.
- [x] Route-handler status-code + validation coverage for the remaining API routes (blocks, calendar, export, stats — push is already covered): import the real (Request)=>Response handlers and assert correct status codes for missing/invalid required fields (400), invalid IDs and missing records (404/safe handling), and the standard apiError JSON error shape. Follow the existing pushRoutes.test.ts style; no new framework.
- [x] Add an aggregate `test` script to package.json that runs the full tsx test suite (all existing test:* scripts) in one command, so the loop and CI can run everything with a single `npm test`.

<!-- Mobile/features batch (user-requested 2026-06-09). Drain top-to-bottom. -->
- [x] (feature) Web-push backend, env-gated: add VAPID-based web push. Read `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` from env (document in .env.example); if unset, the whole feature is a safe no-op (endpoints return a clear "push not configured" state, nothing throws). Add a userId-scoped PushSubscription store (Prisma model), POST/DELETE endpoints to save/remove a subscription, and a small `sendPush(userId, payload)` helper (using the `web-push` lib) that prunes expired/410 subscriptions. Follow existing apiError + validate.ts + rate-limit patterns; add route + helper tests in the established style (mock the sender, no real network). The service worker already has push/notificationclick handlers.
- [x] (feature, depends on web-push backend) Daily study-reminder trigger: add a secured endpoint (e.g. /api/reminders/run, guarded by a `CRON_SECRET` bearer token; no-op if unset) that, for each user with an active subscription, sends a push with today's plan summary ("N sessions, ~Xh planned"). Pure message-builder function + tests; the actual schedule is wired externally (document the cron call in README). Idempotent and safe to call repeatedly.

<!-- Round 2: independent backend hardening (user-requested 2026-06-09). No cross-track deps. -->
- [ ] (hardening) Web-push reliability tests: cover the sender's edge cases without real network — 410/404 Gone prunes the subscription, malformed/expired subscription is skipped, multi-subscription fan-out, and the "push not configured" no-op path. Plus tests for the daily-reminder message builder (0 sessions, many sessions, hours formatting). Mock the web-push sender; follow the existing test style.
- [ ] (perf) Query index + N+1 audit: review the hottest Prisma reads (Today blocks by date+course, topics/blocks by course, insights aggregates) and add the missing composite indexes in schema.prisma (with a migration); confirm list endpoints stay N+1-free (select-only, batched). Add a short note of what was indexed and why. No behavior change.
