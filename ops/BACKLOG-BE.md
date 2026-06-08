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
