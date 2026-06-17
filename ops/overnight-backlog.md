# StudyFlow Overnight Loop — Controller Playbook

You are an **isolated overnight worker** for the StudyFlow app at
`/home/pipi/.openclaw/workspace/studyflow`. You have NO memory of prior chats —
this file + `ops/overnight-state.json` are your only state. Each wake you do
**exactly ONE pending task**, then STOP. Be frugal: one task, then end the turn.

## HARD RULES (read every time)
1. **Time guard.** Run `date "+%H%M"` (host TZ = Europe/Berlin). If it is **≥ 0800**,
   STOP for the night: remove this cron (see "Self-stop") and exit. Do nothing else.
2. **One task per wake.** Never loop over multiple tasks in a single run.
3. **Clean start.** Before anything:
   `cd /home/pipi/.openclaw/workspace/studyflow && git fetch origin -q && git checkout -q main && git reset --hard -q origin/main`
   (discards any half-finished aborted work; untracked files like the state file survive).
4. **Never test against the live DB.** Verification MUST use a throwaway DB:
   `DATABASE_URL="file:./.overnight-test.db" npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1`
   then `DATABASE_URL="file:./.overnight-test.db" npm test`. The real `prisma/dev.db`
   is only touched by the running service. Never run `npm test` with the default env.
5. **Stop on red.** If, after one reasonable in-cycle fix attempt, build/lint/tsc/test
   is still failing, mark the task `blocked`, post a blocker message (see "Notify"),
   self-stop the cron, and exit. Do NOT thrash.
6. **Ship vs draft (per task `mode`):**
   - `ship`  → commit to `main`, push, rebuild + restart the service, verify routes 200.
   - `draft` → commit to branch `feat/redesign-draft` (create from main if missing),
     push the branch. **Never merge, never deploy, never restart for draft tasks.**
7. Commits: author `Mohaboss <xchalabi9@gmail.com>`, NO Co-Authored-By trailer.
8. No new npm deps unless a task explicitly says so.

## CONTROLLER PROTOCOL (each wake)
1. Time guard (rule 1).
2. Clean start (rule 3).
3. Read `ops/overnight-state.json`. Pick the FIRST task whose `status` is `pending`
   (tasks are ordered; respect the order — Phase 1 before 2, etc.).
   - If none pending → **all done**: post the done summary (Notify) + self-stop + exit.
4. Set that task `in_progress` in the state file (untracked — just `Write` it).
5. Implement the task per its spec below. Keep it bounded to the task's scope.
6. **Verify gate:** `npm run lint` && `npx tsc --noEmit` && build + isolated test:
   `npm run build` and the isolated-DB `npm test` (rule 4). All must pass.
   - If red → one fix attempt → re-verify. Still red → rule 5 (blocked + stop).
7. Land it per `mode` (rule 6). For ship: `git add -A && git -c user.name='Mohaboss' -c user.email='xchalabi9@gmail.com' commit -m "<msg>" && git push -q origin main && systemctl --user restart studyflow.service`, then `sleep 4` and curl-check `/` and the touched route return 200; write the sha to `ops/.deployed-sha`.
8. Mark the task `done` (with the commit sha) in `ops/overnight-state.json`. End the turn.

## SELF-STOP
List crons, find the job named **`studyflow-overnight`**, and remove it
(cron action=remove with its id). This guarantees zero further token spend once
work is finished, time is up, or a blocker halts the run.

## NOTIFY (milestones only — stay silent on normal cycles)
Only post to Telegram on **all-done** or **blocked**. Use the gateway message
delivery for this run (your final assistant text is announced to the Crows ·
StudyFlow topic). On a normal successful cycle, end with ONE terse line:
`overnight: <id> <ship|draft> ok (<done>/<total>)`. On done/blocked, write a short
clear summary instead.

---

## TASKS (in order)

### Phase 1 — Trust (mode: ship)
- **P1-tests-clean** — Make `npm test` pass from a truly clean checkout. Reproduce the
  Prisma test-DB bootstrap failure with an isolated DB + empty env; fix `pretest` /
  `scripts/prisma-bootstrap.mjs` so a clean clone's `npm test` works with no manual env.
- **P1-planner-invariants** — Add invariant tests for the planner (`src/lib/planner.ts`,
  `planService.ts`): never schedule past the exam date (unless an explicit impossible
  flag); no duplicate blocks; completing work reduces remaining work; low-priority work
  can slide; a "behind" state yields a safe fallback (never an empty/crashing plan);
  lectures and study-window are respected. Fix any invariant the tests expose.
- **P1-smoke-routes** — Add a render/SSR smoke test that every route (/, /today, /focus,
  /calendar, /courses, /insights, /settings, /catalog) renders without throwing.
- **P1-perf-budgets** — Enforce: large lists collapse (catalog, calendar unscheduled),
  and no desktop-only heavy interactions mount on mobile. Add a lightweight guard/test.

### Phase 2 — Stability & architecture (mode: ship)
- **P2-auth-paths** — Clean, separate dev/test/prod auth paths in `src/auth.ts` +
  `src/lib/devUser.ts`; no route calls `auth()` in a way that throws expected errors; no
  noisy logs in dev.
- **P2-focus-layout** — Make `/focus` a real separate shell via a route group with its
  own minimal layout (no global nav/tabs/FAB structurally), not pathname-based hiding.
- **P2-calendar-hydration** — Confirm/strengthen the @dnd-kit client-only boundary so
  there is no hydration warning on any viewport.
- **P2-error-recovery** — Calm, specific recovery UI (route `error.tsx` boundaries +
  friendly copy) for plan/import/auth/DB failures. No generic "something went wrong".

### Phase 3 — Concept debt (mode: ship)
- **P3-concept-debt** — Purge old vocabulary from CODE (not just UI copy): `panic`,
  `crunch`, `energy`, `untouched`, flame-streak logic — rename to the guardian vocabulary
  or delete. Keep behavior; align names to the thesis.

### Phase 4 — Design system (mode: DRAFT only)
- **P4-design-tokens** — Implement the calm design tokens (globals + ui primitives):
  near-white bg, faint blue/green/gray surfaces, calm teal primary, muted amber (only
  when action needed), red almost never, fewer/flatter/softer cards, consistent corners,
  quiet line icons over emoji-as-status, borders only for inputs/dividers/rows.

### Phase 5 — Guardian UX redesign (mode: DRAFT only)
- **P5-core-trio** — The signature layout on each screen: top = emotional status ·
  middle = one next action · bottom = escape hatch.
- **P5-today** — Today: big calm status, one start, 3–5 visible items, rest under
  "Later/Protected", reassurance ("2 must-do, 3 optional") not stats. No charts.
- **P5-focus** — Focus as the most emotionally distinct "protected room" screen.
- **P5-calendar** — "44 sessions waiting for a home" language, "Place the next 5"
  (not dump-all), desktop "Planning mode" toggle.
- **P5-courses-insights** — Courses as shelves (name · exam/deadline · one status · one
  action). Insights: Rhythm / Load / Recovery / Consistency; quiet streaks.
- **P5-signature** — The "I'm behind" persistent affordance → sheet with
  *Protect today · Move optional work · Make a lighter plan*. Absorbs "Help me catch up".
