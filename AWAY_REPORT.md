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

## 🛠️ Away session — 2026-06-07 ~20:47 (Avi directing Flo) — audit fixes

Mohaboss said **away** + "let Flo work on them all" — the repairable-issues audit.
Flo takes pure-code items; account-gated items stay queued.

**Queue (pure code — Flo does these):**
1. ✅ Timezone: `todayISO()` → Europe/Berlin (`12f8283`).
2. ✅ Error boundaries (`error.tsx` + `global-error.tsx`).
3. ⏳ Calendar feed: rotate/reset token action in Settings.
4. ⏳ `CalendarSync` hydration warning cleanup.
5. ⏳ Input validation (past exam dates, due dates, max lengths).
6. ⏳ Basic rate-limiting on AI calls + uploads (in-code limiter).
7. ⏳ CI workflow (GitHub Actions: tsc + tests + build on push).
8. ⏳ Test coverage (server actions / key logic).
9. ⏳ Accessibility pass (aria-live banners, focus states).
10. ⏳ SEO/social: Open Graph + Twitter card metadata.

**⏸️ Queued for Mohaboss (account-gated, NOT auto-done):** real auth/multi-user
(Supabase), error monitoring (Sentry). These are the "make it real" track.

Each: Flo builds + verifies → Avi reviews → commit as Flo → push → log. Compact
one-increment turns (avoids the 600s CLI turn-timeout).

### Progress log (newest on top)
- **#2 Error boundaries.** Added `src/app/error.tsx` (route-level, in-shell reset
  boundary) + `src/app/global-error.tsx` (last-resort, self-contained html/body).
  On-brand, dark. tsc + build green.
- **`12f8283` #1 Timezone.** todayISO → Europe/Berlin; engine 15/15, service 16/16.

---

## 🛠️ Away session — 2026-06-07 ~18:52 (Avi directing Flo)

Mohaboss said **away** and explicitly authorised Flo to work the buildable backlog
+ the minor cleanup. Account-gated items (Supabase/Vercel/login, CS exam dates)
stay queued — not touched.

**Queue (priority order):**
1. ✅ Batch 3a — Live calendar **subscribe URL** (`f25b3c8`).
2. ✅ Batch 3b — **Reminders foundation** (`66305eb`). ⏸️ Activation needs you (see below).
3. ✅ **Timetable → planner integration** (`3c0a8cf`).
4. ✅ **Seed Maschinenbau** catalog — 17 core modules (`3f215b4`).
5. ✅ Minor — Pomodoro lint warning fixed (`2b768c1`); **eslint now 0 problems**.

Each item: Flo builds + verifies (tsc/build/live), Avi reviews → commit as Flo → push → log here.

## 🔵 BACK 2026-06-07 ~19:46 — away cycle closed. All 5 queued items shipped & pushed; queue exhausted, idling.
**⏸️ Needs you (queued, not auto-done):** activate push reminders (generate VAPID keypair, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`, add a server send fn + cron) — deploy/secret-gated. **🧱 Blocked:** none.

### Progress log (newest on top)
- **`3f215b4` — Seed Maschinenbau (MB).** 17 real Kernqualifikation modules from the
  official MBBS Modulhandbuch (codes/names/LP; content stubs; exam dates null).
  Generalized seeder + MB marked seeded. tsc + build green; /catalog?program=MB
  renders all 17 live. (Finished right as Mohaboss returned.)
- **`3c0a8cf` — Timetable-aware scheduling.** rebuildSchedule subtracts each
  weekday's lecture minutes from that day's study budget (floor 30), so study is
  planned around classes, not on top. Backward-compatible. Verified: engine 15/15,
  service 16/16, tsc + build green. (Build was SIGKILLed once when a turn got cut —
  re-ran clean; not a code issue.)
- **`2b768c1` — Pomodoro lint fix.** Moved the phase-switch out of an effect into
  the tick interval (refs for latest mode/durations); behaviour identical. eslint
  is now fully clean (0 problems) across the project. tsc + build green.
- **`66305eb` — Batch 3b: reminders foundation.** Flo (built directly by Avi after
  the first attempt hit a 600s CLI turn-timeout — now running compact one-increment
  turns). PushSubscription model, sw.js push/notificationclick handlers,
  /api/push/{subscribe,unsubscribe}, PushReminders + Settings section (gated →
  "coming soon" without VAPID/https). tsc + build green; routes 200/400, settings
  renders. **⏸️ To ACTIVATE (needs you):** generate a VAPID keypair, set
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in env, add a server send
  fn (`web-push`) + a cron trigger — all deploy/secret-gated.
- **`f25b3c8` — Batch 3a: calendar subscribe URL.** Flo: `User.calendarToken`,
  shared `lib/ics.ts`, new `/api/calendar/[token]` feed, Settings "Calendar sync"
  card (webcal:// + copy). Avi review: refactor clean, ics byte-identical, tsc +
  build green, both routes register. Minor note: `CalendarSync` host is read
  client-side → benign hydration warning, self-heals (polish later). Shipped.

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
