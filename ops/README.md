# StudyFlow Continuous-Loop Ops

A managed pipeline that builds StudyFlow autonomously until the backlogs are empty.

## The machine
- **2 builders** (FE + BE) drain `BACKLOG-FE.md` / `BACKLOG-BE.md`, one item per cycle → one PR.
- **Controller** (`controller.sh`, run every ~10 min by a cron agent): merges green PRs
  (auto-merge-when-green, squash), advances the backlog, and emits `SPAWN` actions for the
  next item. The cron agent spawns the builder for each `SPAWN`/`FIX` line.
- **Feeders** (security auditor + product researcher) append findings/ideas to the backlogs.

## Invariants (why it doesn't conflict)
- One in-flight item **per track** at a time → no intra-track conflicts.
- FE and BE own disjoint file areas → no inter-track conflicts.
- The controller is the **single writer** of backlog completion + merges.
- Builders never touch `main`, `ops/**`, or each other's lane.

## Stop conditions
- Backlog empty → track marked `done`. Both done → `ALL_DONE` → cron self-disables.
- A failing PR emits `FIX` (a fixer agent is spawned), never auto-merged.
- Conflicts emit `MERGE_BLOCKED` (left for human/Avi).

## State
`loop-state.json` (local, gitignored) tracks branch/cycle/inflight per track.
