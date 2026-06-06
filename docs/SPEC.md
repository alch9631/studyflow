# StudyFlow — Product Spec

> The study plan that builds itself and heals itself.

## The problem

Students don't fail at planning because they lack a calendar. They fail because:

1. **They can't turn a syllabus into a plan.** "Exam in 6 weeks, 12 chapters" never becomes daily study blocks — so they cram.
2. **They can't recover from falling behind.** Miss two days, the static plan is dead, they give up.

Google Calendar, Notion, and Todoist all make *you* do the planning. StudyFlow does it for you, and re-does it when life happens.

## The wedge (what makes people switch)

- **Auto-generated plan** — enter a course + exam date + how much material, get a daily/weekly study schedule working backward from the deadline.
- **"I fell behind" button** — redistributes unfinished work across the days that remain, calmly. No guilt, no broken schedule. *This is the retention feature.*
- **Syllabus → plan (AI)** — upload a syllabus PDF, Claude extracts topics + dates, the course fills itself in. This is the "wow", built last.

## Who it's for

Students who have real deadlines and procrastinate — i.e. all of them. First users: the builder's own classmates (reachable, honest feedback, fast loop).

## Out of scope (for now)

- Team/group study
- Mobile native apps
- Integrations (Canvas, Moodle, Google Calendar sync) — tempting, but later
- Gamification

## Business model

Freemium SaaS:
- **Free:** up to 2 active courses, manual entry.
- **Paid (~€4/mo student price):** unlimited courses, AI syllabus parsing, calendar export.

The point of v1 is **learning + 5 real users**, not revenue. Revenue is the reward for retention.

## Success metric for v1

5 classmates create a course and check off at least one study block in week one. If they come back after falling behind, the wedge works.
