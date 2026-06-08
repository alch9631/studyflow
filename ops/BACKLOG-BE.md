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
