# StudyFlow — AFK Work Report

Running ledger of autonomous work done while Mohaboss is away.
Newest entries on top. On return, read the **Needs you** section first.

---

## ▶ WHEN YOU WAKE UP (test in 30 seconds)

```bash
cd studyflow && npm run dev      # → http://localhost:3000 → "My courses"
```

Two **demo courses are already seeded** (incl. one in "crunch" mode showing the
overload banner + replan). Full guide: **START_HERE.md**. Tests: `npm run test:engine`
and `npm run smoke`. It's all **run-verified** in a real browser — every route returns
200 with real content, no server errors. The only untested path is the live AI import
(needs your `ANTHROPIC_API_KEY`); it's gated and degrades gracefully without one.

Going to production (Supabase + Vercel): **PRODUCTION.md**.

---

## 🛠️ Away session — 2026-06-07 ~18:52 (Avi directing Flo)

Mohaboss said **away** and explicitly authorised Flo to work the buildable backlog
+ the minor cleanup. Account-gated items (Supabase/Vercel/login, CS exam dates)
stay queued — not touched.

**Queue (priority order):**
1. ⏳ Batch 3a — Live calendar **subscribe URL** (tokenised .ics feed, auto-updates in Apple/Google Calendar).
2. ⏳ Batch 3b — **Reminders foundation** (web-push plumbing; gated, fully fires only on https/deploy).
3. ⏳ **Timetable → planner integration** (schedule study around real class times).
4. ⏳ **Seed more Studiengänge** (more TUHH programs into the catalog).
5. ⏳ Minor — fix the Pomodoro `set-state-in-effect` lint warning (last lint nit).

Each item: Flo builds + verifies (tsc/build/live), Avi reviews → commit as Flo → push → log here.

### Progress log (newest on top)
<!-- Flo/Avi entries appended below as items ship -->

---

## 🌙 Away session — 2026-06-07 (Avi, handled directly)

**Done & pushed:**
- **Night mode** 🌙 — class-based dark theme (`@custom-variant dark` + dark CSS vars),
  a **theme toggle** in the nav (persists to localStorage, respects system pref), a
  **no-flash** init script in `layout.tsx`, and `dark:` variants applied across all
  pages/components. Verified: toggle renders, init script present, dark utilities
  compile; `tsc` + `next build` green.

**Not started (per delegate rules — these are new features needing your go-ahead):**
- The pasted **"AI Study Planner" idea** is ~95% already built (module mgmt, AI weekly
  plan, prioritization, progress tracking, adaptive rescheduling). The only genuinely
  new MVP items are a **basic analytics dashboard** ("procrastination patterns /
  planned-vs-completed insights") and deeper **calendar integration** (we have .ics
  export). Queued for when you're back — say the word and I'll build the analytics dash.

---

## ⏸️ Needs you (queued — not acted on)

- **Supabase account + `DATABASE_URL`** — real Postgres for production. Local dev runs on SQLite, so this is *not* blocking; swap when ready.
- **Real auth** — depends on Supabase. Building with a local "dev user" stand-in for now so the app is fully usable offline.
- **Vercel deploy** — needs your login. Code stays deploy-ready.
- **`ANTHROPIC_API_KEY`** — for the Day 6 syllabus parser. Not needed until then.

## 🧱 Blocked

- _(none)_

## ✅ Done

## 🔵 BACK 2026-06-06 19:28 — away cycle closed. While away (Avi directing Flo): added planService unit tests (16/16) + lint cleanup, both committed & pushed. No blockers; nothing broke. Queue below ("Needs you") unchanged.

### Session — planService unit tests — 2026-06-06 19:18 (`5ecd311`)
- **Flo:** added `src/lib/planService.test.ts` — **16 tests** for the previously unit-untested core logic: completion-folding (the differentiator — proves completed work is NOT redistributed), DB→engine course mapping, stable `blockKey` identity. Exported 3 pure fns for testing, **no behavior change**. New script `test:service`.
- **Verified:** test:service 16/16 · test:engine 11/11 · lint 0/0 · tsc clean · build green.
- **Avi:** reviewed diff (source untouched except `export` keywords), committed as Flo, pushed. (Note: this report's prior edit got swept into the commit — harmless; will commit report separately going forward.)

### Session — Delegate test cycle (Avi directing Flo) — 2026-06-06 19:13 (`5e2cfbf`)
- **Flo:** removed unused `Link` import in `src/app/today/page.tsx` (eslint warning). Verified: `lint` 0/0 · `tsc --noEmit` clean · `next build` green (5 pages).
- **Avi:** reviewed the 1-line diff, committed as Flo (author=Flo, committer=Mohaboss), pushed to main. First live run of the Avi→Flo delegate loop. ✅

### Session — Make it test-ready (run-verified, seeded, documented)
- **Booted the real production server** and exercised every route — `/`, `/courses`, `/courses/new`, `/courses/import`, `/today`, `/courses/[id]`. All return 200 with real content; overload banner and the AI-off notice both render; **zero server errors**. (Build only proves it compiles — this proves it *runs*.)
- **Seed data** (`prisma/seed.ts`, `npm run db:seed`): two demo courses — "Algorithms" (healthy) and "Operating Systems (crunch!)" (overload + replan demo). 24 study blocks. So you can test instantly without creating anything.
- **START_HERE.md** — 30-second test guide. **PRODUCTION.md** — exact Supabase + Vercel + auth steps.
- All green: `tsc` · `next build` (7 routes) · `test:engine` 6/6 · `smoke` · live route checks.

### Session — Day 6 (AI syllabus import) — code-complete, needs your key to verify
- **`/courses/import`** — paste a syllabus → Claude extracts course name, exam date, and weighted topics via **structured outputs** (`claude-opus-4-8`), then auto-builds the plan. (`src/lib/syllabus.ts`, action `importSyllabus`.)
- v1 takes **pasted text** (PDF upload deferred — fewer moving parts, same wow).
- **Gated**: if `ANTHROPIC_API_KEY` is unset, the page shows a friendly notice and the app still runs fully. So this is *not* blocking.
- **Verified what I can**: `tsc` clean · `next build` green (7 routes). ⏸️ I could **not** run the live Claude call (needs your key) — that's the one unverified path. Drop the key in `.env` and try the Import page to confirm.
- Model note: used `claude-opus-4-8` for best extraction; `claude-haiku-4-5` is a cheaper swap (one line in `syllabus.ts`) if you want to cut cost per import.

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
