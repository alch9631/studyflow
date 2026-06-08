# Backend / Data Backlog

The BE builder drains this top-to-bottom. One item per cycle → one PR → auto-merge when green.
Format: `- [ ] item`. Controller flips to `- [x]` on merge. Feeders (security/research) append below.

- [x] Input validation hardening: every server action + API route (reuse date-reject pattern) — PR #11
- [x] More planService/engine edge-case tests (overlapping exams, zero-day, huge load) — PR #13
- [x] Consistent JSON error shape + error handling across API routes — PR #15
- [x] Performance: eliminate N+1 Prisma queries on /insights and /today — PR #17
- [ ] Data export endpoint: JSON + CSV of courses, topics, progress
- [ ] Streak + study-time aggregation helpers with tests (if not covered by stats.ts)
- [ ] Defensive limits: max courses/topics per user, payload size guards
- [ ] Audit + tidy Prisma queries (select only needed fields)
