# StudyFlow ⚡

**The study plan that builds itself and heals itself.**

Students don't fail at planning for lack of a calendar — they fail because nobody turns a syllabus into daily study blocks, and because falling behind kills static plans. StudyFlow generates a plan from a course + exam date, and when you fall behind, one button calmly redistributes the rest across the days you have left.

> Full reasoning in [`docs/SPEC.md`](docs/SPEC.md). Build plan in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Core feature set (v1)

1. **Auto-generated study plan** — enter a course, get a daily/weekly schedule that works backward from the exam.
2. **"I fell behind" button** — redistributes unfinished work, no guilt. *The reason people stay.*
3. **Syllabus → plan (AI)** — paste a syllabus / upload material, OpenAI fills in topics + dates.
4. **Source → task → result** — save course materials without AI, attach a file or link and a page/exercise reference to a task, and define what counts as finished. Focus shows the instruction and source; optional check questions include an answer key. A checked goal finishes the task, while **Needs more practice** updates the remaining plan with another attempt.

Set **Settings → Focused study per day** to your available study time. The planner
uses this limit together with your study window and lectures. Logged timer minutes
do not automatically finish a task with a defined goal.

Original uploads are stored privately in the database (20 MB per file, 100 files
per course, 200 MB per user). Older analysis-only uploads need uploading again to
open the original. The schema additions are nullable and preserve existing plans,
topics, and completed sessions. Run the isolated study-loop checks with
`npm run test:study-tasks`.

## TUHH exam date sync

In **Settings → Calendar sync → TUHH exam dates**, refresh the official current-semester
exam schedule, review the suggested course matches, and apply selected date changes.
You can choose an exam manually when course names differ. Applying dates rebuilds the
study plan and preserves completed sessions. Passed courses are excluded.

This is an on-demand check, with the last check time shown in the preview. Individual
appointments and multi-day exam windows need your personal date entered in the course
settings. The source is checked again before saving, and changed courses or exam entries
require a refreshed preview. No TUHH login or extra configuration is needed.

Run the parser and isolated database checks with `npm run test:exam-sync`.

## The plan engine

The heart of the app lives in [`src/lib/planner.ts`](src/lib/planner.ts) — pure, framework-free TypeScript. No DB, no React, fully unit-tested.

```bash
npx tsx src/lib/planner.test.ts   # run the engine tests
```

`generatePlan(course, today)` builds a schedule. `healPlan(course, today)` re-spreads unfinished work across remaining days and flags overload.

## Stack

Next.js (App Router, TS) · Tailwind · Supabase (Postgres + auth) · Prisma · OpenAI API · Vercel.

## Local setup

> **Just want to try it?** See **[START_HERE.md](START_HERE.md)** — local dev needs no setup (SQLite + a dev user), and demo data is seeded. `npm install && npm run dev`.

Requires **Node 24** (see [`.nvmrc`](.nvmrc); `nvm use` picks it up).

```bash
git clone <repo> && cd studyflow
npm install
cp .env.example .env   # the only required var is DATABASE_URL (defaults to SQLite)
npm run setup          # creates .env if missing, builds the SQLite DB, seeds demo data + TUHH catalog
npm run dev            # http://localhost:3000
```

`npm run setup` is idempotent (`cp` above is optional — setup copies `.env` for
you if it's absent); after the first run just `npm run dev`. Outside production,
the app signs you in as a seeded dev user automatically — no Google OAuth needed.

Run the full verification suite (what CI runs) with:

```bash
npm run ci   # prisma generate + db push → lint → tsc --noEmit → tests → build
```

For production (Postgres + auth + deploy), see **[PRODUCTION.md](PRODUCTION.md)**.

The live Pi instance automatically deploys CI-green pushes to `main`. Installation,
status, logs, and rollback behavior are documented in **[ops/AUTO_DEPLOY.md](ops/AUTO_DEPLOY.md)**.

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
