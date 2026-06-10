# StudyFlow ⚡

**The study plan that builds itself and heals itself.**

Students don't fail at planning for lack of a calendar — they fail because nobody turns a syllabus into daily study blocks, and because falling behind kills static plans. StudyFlow generates a plan from a course + exam date, and when you fall behind, one button calmly redistributes the rest across the days you have left.

> Full reasoning in [`docs/SPEC.md`](docs/SPEC.md). Build plan in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Core feature set (v1)

1. **Auto-generated study plan** — enter a course, get a daily/weekly schedule that works backward from the exam.
2. **"I fell behind" button** — redistributes unfinished work, no guilt. *The reason people stay.*
3. **Syllabus → plan (AI)** — paste a syllabus / upload material, OpenAI fills in topics + dates.

## The plan engine

The heart of the app lives in [`src/lib/planner.ts`](src/lib/planner.ts) — pure, framework-free TypeScript. No DB, no React, fully unit-tested.

```bash
npx tsx src/lib/planner.test.ts   # run the engine tests
```

`generatePlan(course, today)` builds a schedule. `healPlan(course, today)` re-spreads unfinished work across remaining days and flags overload.

## Stack

Next.js (App Router, TS) · Tailwind · Supabase (Postgres + auth) · Prisma · OpenAI API · Vercel.

## Getting started

> **Just want to try it?** See **[START_HERE.md](START_HERE.md)** — local dev needs no setup (SQLite + a dev user), and demo data is seeded. `npm install && npm run dev`.

```bash
npm install
npm run setup    # creates .env, builds the SQLite DB, seeds demo data + TUHH catalog
npm run dev      # http://localhost:3000
```

`npm run setup` is idempotent; after the first run just `npm run dev`.

For production (Postgres + auth + deploy), see **[PRODUCTION.md](PRODUCTION.md)**.

## Daily study reminders (cron)

`POST /api/reminders/run` sends each user with a push subscription a notification
summarizing today's plan (`"N sessions, ~Xh planned"`). Wire it to any scheduler
to fire once a day. It's idempotent and safe to call repeatedly — it only reads
the plan and emits notifications; no data is mutated.

The endpoint is guarded by a bearer token. Set `CRON_SECRET` in `.env` (see
`.env.example`); leave it blank and the endpoint is a safe no-op
(`{ disabled: true }`, nothing sent). Delivery additionally needs the VAPID keys
(without them the run reports `configured: false`).

```bash
# Once a day, e.g. crontab: 0 7 * * *
curl -fsS -X POST https://your-app.example/api/reminders/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

On Vercel, add a `vercel.json` cron pointing at the path; the platform injects
the header from the project's `CRON_SECRET` env var.

## Status

🚧 Day 1 — foundation. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's next.

---

Built by [@alch9631](https://github.com/alch9631). A computer-engineering student learning full-stack + AI app development by shipping something real.
