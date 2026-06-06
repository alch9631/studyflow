# StudyFlow ⚡

**The study plan that builds itself and heals itself.**

Students don't fail at planning for lack of a calendar — they fail because nobody turns a syllabus into daily study blocks, and because falling behind kills static plans. StudyFlow generates a plan from a course + exam date, and when you fall behind, one button calmly redistributes the rest across the days you have left.

> Full reasoning in [`docs/SPEC.md`](docs/SPEC.md). Build plan in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Core feature set (v1)

1. **Auto-generated study plan** — enter a course, get a daily/weekly schedule that works backward from the exam.
2. **"I fell behind" button** — redistributes unfinished work, no guilt. *The reason people stay.*
3. **Syllabus → plan (AI)** — upload a PDF, Claude fills in topics + dates. (Built last.)

## The plan engine

The heart of the app lives in [`src/lib/planner.ts`](src/lib/planner.ts) — pure, framework-free TypeScript. No DB, no React, fully unit-tested.

```bash
npx tsx src/lib/planner.test.ts   # run the engine tests
```

`generatePlan(course, today)` builds a schedule. `healPlan(course, today)` re-spreads unfinished work across remaining days and flags overload.

## Stack

Next.js (App Router, TS) · Tailwind · Supabase (Postgres + auth) · Prisma · Claude API · Vercel.

## Getting started

> **Just want to try it?** See **[START_HERE.md](START_HERE.md)** — local dev needs no setup (SQLite + a dev user), and demo data is seeded. `npm install && npm run dev`.

```bash
npm install
cp .env.example .env        # DATABASE_URL defaults to local SQLite
npm run db:push             # create the SQLite tables
npm run db:seed             # optional: demo courses
npm run dev                 # http://localhost:3000
```

For production (Postgres + auth + deploy), see **[PRODUCTION.md](PRODUCTION.md)**.

## Status

🚧 Day 1 — foundation. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's next.

---

Built by [@alch9631](https://github.com/alch9631). A computer-engineering student learning full-stack + AI app development by shipping something real.
