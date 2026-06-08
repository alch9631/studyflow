# Frontend / UI Backlog

The FE builder drains this top-to-bottom. One item per cycle → one PR → auto-merge when green.
Format: `- [ ] item`. Controller flips to `- [x]` on merge. Feeders (research) append below.

- [x] Skeleton loading states for /insights — PR #10 (only /insights shipped; rest split out below)
- [x] Skeleton loading states for the remaining routes: /today, /courses, /courses/[id], /catalog — PR #12
- [x] Empty states with clear CTAs (no courses yet, no plan yet, no exams) — PR #14
- [x] Full mobile-responsive pass across every page (test at 375px width) — PR #16
- [x] User feedback on server actions: toast/inline success + error states — PR #19
- [x] Dark-mode audit + consistency across all components — PR #20
- [x] Landing page polish: hero, feature grid, social proof, strong CTA — PR #22
- [ ] Accessible forms: labels, inline validation errors, focus management
- [ ] Consistent design tokens (buttons, cards, spacing, type scale) on remaining pages
- [ ] Settings page polish + clearer copy
- [ ] Global nav: active states, mobile drawer, keyboard navigable
- [ ] Keyboard navigation & visible focus rings across all interactive elements
- [ ] Pending/disabled states on all submit buttons during server actions
- [ ] Confirmation dialogs for destructive actions (delete course/topic/deadline/class)
- [ ] Per-route page metadata/titles for clearer browser tabs
- [ ] Consistent iconography & button sizing pass across pages
- [ ] WCAG AA color-contrast pass across components
- [ ] Micro-interaction/transition consistency (hover/active/focus)
- [ ] Insights data-viz polish (chart/legend clarity, responsive)
