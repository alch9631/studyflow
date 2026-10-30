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
open the original. The course picker accepts multiple files with one Upload;
files upload sequentially with progress, and Retry sends only failed files.
The schema additions are nullable and preserve existing plans,
topics, and completed sessions. Run the isolated study-loop checks with
`npm run test:study-tasks`.

**Upload and prepare plan** reads the whole script before presenting its chapter
structure. Multi-page contents lists and numbered/Markdown headings retain their
original titles, hierarchy and source pages. Chapters group the preview; their
sections become ordered planning units without counting both a chapter and all
its sections as separate full workloads. The student reviews the outline before
adding it. Every upload path, including Quick start and first setup, recognizes
chapters automatically when saving the file. Opening a course also refreshes
older uploads one at a time, even when they have an old six-page task batch.
File cards show the result and offer **Review chapter plan**. Recognition is
versioned and caches both found outlines and no-outline results; failed reads
retain the original and offer a retry. Automatic refresh preserves accepted
source mappings and never changes the plan before review. Optional replacement keeps
completed work, notes, confidence ratings and existing study tasks. Scanned PDFs
still need a readable text layer; uncertain outlines are explicitly reported.

**Prepare small tasks instead** splits material into source-backed tasks
you review before adding. AI can suggest specific instructions and recall checks;
without AI the app prepares reading/exercise tasks directly from the excerpts.
Generated answer keys must be exact text from the supplied source. **Next excerpts** prepares
later sections of the same upload. PDF references retain real page numbers; DOCX
uses text excerpts. Scans without readable text keep the original available for
Quick start.

**Quick start** also opens directly from Today: choose Read, Solve, or Recall,
your material (or own notes), and 15/30/45 minutes. Instructions and a finish
condition are supplied automatically. Focus shows the source beside your working
answer, with an optional timer and a quick outcome check. **Save and leave** and
autosave retain answers, time, and session length on the topic, so **Resume** works
after scheduling changes. A practice follow-up includes the previous attempt.
Run `npm run test:practical` for the isolated source, draft, and resume checks.

## First task, progress, and recovery

Use **Set up your first study task** to confirm daily capacity, study days, exam
and material before planning. Existing catalog, manual and import flows also ask
for total focused time across courses. Quick start previews the exact source
section, suggests a topic match when it is unambiguous, and continues from prior
source positions. Uncertain matches require a section choice.

A concrete task can cover part of a broader topic. Finishing it preserves the
parent topic and its uncovered work; the scheduler allocates its estimate without
double-counting. Task completion is a self-check, and does not automatically mark
confidence solid. Insights reports task results and later recall separately.

Today keeps classes, deadlines, missed work and exam overload visible even when
no study sessions are scheduled. Due reviews and struggling topics participate
in the same priority queue as new material; a short reason explains the next task.
**Adjust today** recommends rebalancing and previews the next three days. The last
adjustment can be undone for 30 minutes while the planning state is unchanged.
Undo preserves completed work and refuses to overwrite later activity.

The additive schema changes preserve existing tasks and histories. Run
`npm run test:experience` for integration checks and follow
[`docs/USABILITY_CHECK.md`](docs/USABILITY_CHECK.md) with five classmates.

## Exams and official TUHH dates

Open **Menu → Exams** (`/exams`) for remaining exams ordered by date. **Refresh** reads
TUHH’s official current-semester schedule and saves uniquely matched upcoming dates.
Date changes rebuild the study plan while preserving completed sessions. Passed courses
are excluded; unfinished courses with old dates stay available under **Dates to check**.

The page starts with a proportional exam timeline and swipeable month calendars.
Matching color keys connect dates to the complete list below. Tap an exam day to
reach its exams; shared days show their count. Arrow buttons and keyboard navigation
also browse months. The calendar starts at the next exam month, covers the final exam,
and offers at least three months. Dates and gaps use calendar days, including across
daylight-saving changes. Distant month bodies render on demand.

The last successful check and published semester survive reopening. Unavailable or
unreadable sources leave saved dates intact. Ambiguous, unpublished and individual
appointments keep the existing date with a short status. Use a row’s pen to search for
the correct published exam when names differ; the selected title is retained for future
checks. Individual appointments still need the personal date entered in course settings.
The source is checked again before a selection is saved. No TUHH login is needed.

Run the parser and isolated database checks with `npm run test:exam-sync` and `npm run test:exams`.
Run calendar and timeline geometry checks with `npm run test:exam-overview`.

## The plan engine

The heart of the app lives in [`src/lib/planner.ts`](src/lib/planner.ts) — pure, framework-free TypeScript. No DB, no React, fully unit-tested.

```bash
npx tsx src/lib/planner.test.ts   # run the engine tests
```

`generatePlan(course, today)` builds a schedule. `healPlan(course, today)` re-spreads unfinished work across remaining days and flags overload.

## Stack

**Primary product:** Expo / React Native for iPhone (`apps/mobile`).

**Backend and web planner:** Next.js (App Router, TypeScript), Prisma, Auth.js / Google sign-in, and server-side AI processing.

The first native flow is Today → Focus → saved result. See **[the iPhone development guide](apps/mobile/README.md)** for setup, authentication, verification and remaining native features.

```sh
npm --prefix apps/mobile ci
npm run mobile
```

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

For backend production deployment, see **[DEPLOY.md](DEPLOY.md)**.

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

The iPhone app is being developed in `apps/mobile` alongside the working web planner. Native course management, calendar, reminders and release preparation follow the first Today / Focus slice.

---

Built by [@alch9631](https://github.com/alch9631). A computer-engineering student learning full-stack + AI app development by shipping something real.
