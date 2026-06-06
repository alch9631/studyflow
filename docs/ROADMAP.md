# StudyFlow — Build Roadmap

One thing per day. A finished simple app beats an unfinished clever one.

## Week 1 — ship a working manual planner

- [x] **Day 1 — Foundation.** `create-next-app` (TS + Tailwind + App Router), deploy empty app to Vercel so deployment is solved early. Add Prisma + schema, plan engine (`src/lib/planner.ts`) with passing tests.
- [ ] **Day 2 — Auth + create a course.** Supabase auth. A logged-in user can create a Course (name, exam date, # of topics/chapters, study days, minutes/day).
- [ ] **Day 3 — Generate the plan.** Wire `generatePlan()` to a course. Show study blocks in a weekly view.
- [ ] **Day 4 — The heal button.** "I fell behind" → `healPlan()` redistributes unfinished work across remaining days. Surface the overload warning. *This is the differentiator — make it feel good.*
- [ ] **Day 5 — Daily view + progress.** "What to study today", check off blocks, per-course progress bar.
- [ ] **Day 6–7 — The magic.** Upload syllabus PDF → Claude extracts topics + dates → auto-fill the course. Rough is fine.

Then: text 5 classmates, watch them use it, fix what confuses them. Their behavior decides week 2.

## Engineering notes

- The plan engine is **pure and framework-free** (`src/lib/planner.ts`). Keep DB/UI out of it. It already has tests — run `npx tsx src/lib/planner.test.ts`.
- Get the **boring manual version shippable first**. AI parsing is day 6 for a reason: it's the hardest and least essential to the core loop.
- Deploy early and often. A broken deploy on day 6 is a crisis; on day 1 it's a 5-minute fix.

## Stack

- Next.js + TypeScript (App Router, `src/` dir)
- Tailwind CSS (+ shadcn/ui when you want nicer components)
- Supabase (Postgres + auth)
- Prisma (type-safe DB access)
- Claude API (syllabus parsing)
- Vercel (hosting)

## Stretch (post-v1, only if users pull for it)

- Calendar export (.ics)
- Spaced-repetition review blocks before exams
- Canvas/Moodle import
