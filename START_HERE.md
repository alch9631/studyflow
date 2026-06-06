# 👋 Start here (test it in 30 seconds)

Everything runs locally with **zero setup** — SQLite + a built-in dev user. No Supabase, no API key needed to try it.

```bash
cd studyflow
npm run dev
```

Then open **http://localhost:3000** and click **“My courses”**.

There's already **demo data** waiting (run `npm run db:seed` anytime to reset it):

- **Algorithms** — a healthy course with a comfortable runway. Open it to see the auto-generated weekly study plan.
- **Operating Systems (crunch!)** — exam in a few days with too much work, so the **⚠️ overload banner** shows. Hit **“😵‍💫 I fell behind — replan”** to watch the plan redistribute across the days left.

### What to try

1. **/courses** — your courses with progress bars.
2. **Open a course** — weekly plan, check topics done (the plan rebuilds without them), hit the replan button.
3. **/today** — what to study today across all courses; check blocks off.
4. **/courses/new** — create your own course manually.
5. **/courses/import** — the AI syllabus importer. It shows an “add your key” notice until you set `ANTHROPIC_API_KEY` (see below).
6. **/catalog** — 🎓 **TUHH module catalog (IIW)**. All 41 Informatik-Ingenieurwesen Bachelor modules from the official handbook. Tick the ones you take → StudyFlow creates a planned course for each. (Run `npm run db:seed:catalog` once if the list is empty.) With an `ANTHROPIC_API_KEY` set, topics are extracted from the handbook text per module; without one, sensible ECTS-sized units are used.

### Run the tests

```bash
npm run test:engine   # 6 unit tests for the plan engine
npm run smoke         # end-to-end DB test (create → plan → heal)
```

### Turn on the AI importer (optional)

Add to `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
```

Restart `npm run dev`, then paste a syllabus at **/courses/import**. This is the one feature I couldn't verify for you (it needs your key) — everything else is tested.

### Going to production

See **[PRODUCTION.md](PRODUCTION.md)** — step-by-step Supabase (real DB + auth) and Vercel (deploy). Not needed for local testing.
