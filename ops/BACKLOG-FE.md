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
- [x] Undo for accidental toggles: after marking a session/topic done, show an "Undo" action in the toast (≈3s grace) that reverts the action, instead of forcing the user to find and re-toggle it
- [x] (user request) Adopt shadcn/ui foundation — FOUNDATIONAL, scope this PR to setup + core primitives only (do NOT rewrite all 42 components in one PR): run `npx shadcn@latest init` (Tailwind v4 / React 19 compatible), add lucide-react, then convert ONLY the base Button and Card to shadcn equivalents and swap them in across existing usages. Preserve current design tokens/dark-mode theming (map shadcn CSS vars to existing palette so nothing visually regresses). Leave Dialog/Dropdown/Input conversions as follow-up backlog items.
- [x] (follow-up to shadcn adoption) Convert Dialog/confirmation modals + Dropdown/menu components to shadcn (Radix-backed) equivalents, keeping existing behavior and theming
- [x] (follow-up to shadcn adoption) Convert form Input/Select/Textarea + inline validation to shadcn equivalents, preserving current accessible-forms behavior
- [x] (user request) Add Framer Motion for transition polish: animate study-block/list item enter/exit on /today and course/[id], and modal open/close. Keep it subtle (respect prefers-reduced-motion).

<!-- Mobile-friendliness + features batch (user-requested 2026-06-09). Drain top-to-bottom. -->
- [x] (mobile) Bottom tab bar nav: add a thumb-reachable fixed bottom navigation (Today / My Courses / Insights, with icons + active state) shown ONLY on mobile (`lg:hidden`); keep the existing top bar/drawer for desktop + secondary items (Modules, Settings). Must respect safe-area inset at the bottom, not overlap page content (add bottom padding to the app shell when the bar is visible), and be keyboard/screen-reader accessible with aria-current on the active tab.
- [x] (mobile) Safe-area insets / notch handling: add `viewport-fit=cover` to the viewport and apply `env(safe-area-inset-*)` padding so content, the sticky top bar, the mobile drawer, and any bottom bar/fixed CTAs are never clipped by the iPhone notch or home indicator. Verify on a tall mobile viewport (390x844-ish) in both orientations.
- [x] (feature) Study streak: surface a visible streak counter (consecutive active study days) on /today (header) and /insights, reusing the consistency/active-day data already computed in stats. Show current streak + best streak, with a subtle milestone treatment (e.g. 🔥 at 3/7/30). Add a small helper + tests for the streak calc if not already covered.
- [x] (mobile) Touch gestures: swipe-to-complete and swipe-to-delete on Today study-block rows and course/topic rows (with an undo toast), pull-to-refresh on /today, and light haptics (`navigator.vibrate`, guarded) on toggle/complete. Keep all existing button affordances working; gestures are additive and must degrade gracefully where unsupported.
- [x] (feature) Quick-add FAB: a floating action button (mobile, bottom-right, above the bottom bar + safe-area) that opens a quick "add course" flow (link to /courses/new or a lightweight sheet). Accessible label + focus management.
- [x] (feature) One-tap calendar subscribe: surface the existing webcal/ics calendar feed (getCalendarToken + /api/calendar) in Settings as an "Add to calendar (Apple/Google)" button with the webcal:// link + copy-link fallback. Explain it stays in sync.
- [ ] (feature) First-run onboarding: a one-time, dismissible onboarding (stored in localStorage) for users with no courses — 3 short steps (add a course → check off sessions on Today → track progress on Insights) with a skip. Don't show it once they have courses.
- [ ] (feature, depends on web-push backend) Push subscribe UI: wire the existing PushReminders component to the real web-push backend — request permission, subscribe via the VAPID public key, POST the subscription to the save endpoint, and show subscribed/unsubscribe state + a "send test" affordance. Graceful, clearly-disabled state when push isn't configured/supported.
- [ ] (feature) Insights GPA/grade trend: if the user has grades across courses, add a small trend visualization (per-course or over time) using the existing chart lib; skip gracefully when there's not enough grade data.
