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
- [x] Accessible forms: labels, inline validation errors, focus management
- [x] Consistent design tokens (buttons, cards, spacing, type scale) on remaining pages
- [x] Settings page polish + clearer copy
- [x] Global nav: active states, mobile drawer, keyboard navigable
- [x] Keyboard navigation & visible focus rings across all interactive elements
- [x] Pending/disabled states on all submit buttons during server actions
- [x] Confirmation dialogs for destructive actions (delete course/topic/deadline/class)
- [x] (user feedback, single PR) Mobile UI fixes across three areas: (1) My Courses — rename the per-course "Open" button to "Update Progress", remove the "Edit" button, make tapping a module/course row auto-open it (whole row is the tap target, no separate button); (2) Today — clarify the "Focus Timer" (obvious label + helper text + clear start/stop UX) or remove it if it has no real function, standardize inconsistent mobile button sizes (uniform height/padding, >=44px touch targets), improve the poor styling of the text/number input boxes and the module-reference display; (3) Modules — fix the "Selected" button that is misaligned at the bottom of the card
- [x] Per-route page metadata/titles for clearer browser tabs
- [x] Consistent iconography & button sizing pass across pages
- [x] WCAG AA color-contrast pass across components
- [x] Micro-interaction/transition consistency (hover/active/focus)
- [x] Insights data-viz polish (chart/legend clarity, responsive) — replace hand-rolled div-bar charts in insights/page.tsx with a real chart lib (recharts): tooltips on "last 7 days", plus a new 14-day consistency trend chart (surface the already-computed consistency score visually)
- [x] Optimistic updates on toggle actions: marking a session done on /today and toggling a topic on courses/[id] currently wait for the server round-trip (only the toast confirms) — add client-side optimistic state with rollback on error so taps feel instant
- [ ] Undo for accidental toggles: after marking a session/topic done, show an "Undo" action in the toast (≈3s grace) that reverts the action, instead of forcing the user to find and re-toggle it
- [ ] (user request) Adopt shadcn/ui foundation — FOUNDATIONAL, scope this PR to setup + core primitives only (do NOT rewrite all 42 components in one PR): run `npx shadcn@latest init` (Tailwind v4 / React 19 compatible), add lucide-react, then convert ONLY the base Button and Card to shadcn equivalents and swap them in across existing usages. Preserve current design tokens/dark-mode theming (map shadcn CSS vars to existing palette so nothing visually regresses). Leave Dialog/Dropdown/Input conversions as follow-up backlog items.
- [ ] (follow-up to shadcn adoption) Convert Dialog/confirmation modals + Dropdown/menu components to shadcn (Radix-backed) equivalents, keeping existing behavior and theming
- [ ] (follow-up to shadcn adoption) Convert form Input/Select/Textarea + inline validation to shadcn equivalents, preserving current accessible-forms behavior
- [ ] (user request) Add Framer Motion for transition polish: animate study-block/list item enter/exit on /today and course/[id], and modal open/close. Keep it subtle (respect prefers-reduced-motion).
