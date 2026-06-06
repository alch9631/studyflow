# StudyFlow — AFK Work Report

Running ledger of autonomous work done while Mohaboss is away.
Newest entries on top. On return, read the **Needs you** section first.

---

## ⏸️ Needs you (queued — not acted on)

- **Supabase account + `DATABASE_URL`** — real Postgres for production. Local dev runs on SQLite, so this is *not* blocking; swap when ready.
- **Real auth** — depends on Supabase. Building with a local "dev user" stand-in for now so the app is fully usable offline.
- **Vercel deploy** — needs your login. Code stays deploy-ready.
- **`ANTHROPIC_API_KEY`** — for the Day 6 syllabus parser. Not needed until then.

## 🧱 Blocked

- _(none)_

## ✅ Done

### Session — Day 5 (today view + progress)
- **`/today`** — every study block scheduled for today across all courses, with check-off (block `completed` toggle) and a "X/Y min done" tally.
- **Progress bars** on the course list; Today links from the landing page and course list.
- **Verified:** `tsc` clean · `next build` green (6 routes). Closed issue #4.

### Session — Day 2–4 (data layer + create course + plan + heal)
- **Local DB without your accounts:** dev-ing on SQLite (`prisma/dev.db`), so the app runs fully offline. Postgres/Supabase is a one-line provider swap later (documented in schema + README).
- **Dev-user stand-in** (`src/lib/devUser.ts`) replaces real auth for now — swap to the Supabase session user when it lands, nothing else changes.
- **Create a course** (issue #1 core): `/courses/new` form → server action persists course + topics → first plan generated. `/courses` lists them.
- **Generate plan** (issue #2): `planService` maps the DB course into the pure engine, persists `StudyBlock`s, weekly view on `/courses/[id]`.
- **"I fell behind" → replan** (issue #3): heal button redistributes unfinished work across remaining days; amber overload banner when there's more work than time.
- **Topic progress:** check topics done → plan rebuilds without them.
- **Verified:** `tsc` clean · `next build` green (5 routes) · engine tests 6/6 · new end-to-end DB smoke test passes (`npm run smoke`).

### Session — Day 1 (foundation)
- Next.js + TS + Tailwind scaffold, plan engine (`src/lib/planner.ts`) with 6 passing tests, Prisma schema, docs, repo pushed, roadmap as issues #1–6.
