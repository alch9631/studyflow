# FE Quality Guide — StudyFlow Frontend Standard

Reference pack for the FE builder. The per-cycle `brief-fe.tmpl` carries the distilled
"Frontend Quality Bar"; this file is the full version for deeper guidance.

Baseline mindset:

> You are a senior frontend engineer and product designer. Build a production-quality
> webapp frontend that feels professional, polished, responsive, and user-friendly.
>
> Prioritize: clean visual hierarchy · excellent spacing & alignment · modern UI
> components · smooth micro-interactions · clear navigation · accessibility · fast
> loading · mobile-first responsiveness · consistent typography, colors, and component
> behavior.
>
> Do not create a generic template. Make the interface feel intentional, refined, and
> ready for a real SaaS/product launch.

---

## 1. Design direction
Create/extend a modern UI style. It should feel professional, minimal-but-not-empty,
premium, trustworthy, easy to use, and slightly playful through subtle motion.

Use a consistent design system: primary/secondary/muted/success/warning/danger colors ·
typography scale · spacing scale · button variants · card styles · form styles ·
table/list styles · empty states · error states · loading states.

Avoid clutter, random colors, inconsistent margins, and overused generic dashboard layouts.

## 2. UX / product thinking
Before building UI, define for each page: the main user goal · the most important action ·
secondary actions · likely confusion points · error cases · empty states · loading states ·
success feedback. Every screen makes the next action obvious. Reduce cognitive load — don't
make users guess.

## 3. Layout
Strong visual hierarchy. Important content first · generous whitespace · precise alignment ·
no cramped cards · consistent page padding · short, logically grouped forms · sticky nav only
when useful · primary CTAs visually dominant · secondary actions quieter. Balanced on desktop,
tablet, and mobile.

## 4. Component quality
Reusable, clean, scalable. Each component supports (where relevant): loading · disabled ·
error · empty states · responsive behavior · keyboard accessibility · clear hover/focus/active
states. Extract a reusable component when a pattern repeats — no messy repeated markup.

## 5. Micro-interactions
Tasteful and subtle: hover effects · focus rings · button press states · smooth transitions ·
toast notifications · skeleton loaders · modal animations · dropdown animations · form
validation feedback. Animations improve clarity, not distract. Fast, smooth, professional.

## 6. Accessibility (non-negotiable)
Semantic HTML · proper heading structure · keyboard navigation · visible focus states · ARIA
only when needed · good color contrast · labels for all inputs · error messages connected to
inputs · buttons must be buttons and links must be links · modals & dropdowns keyboard-usable.
Don't sacrifice accessibility for aesthetics.

## 7. Mobile responsiveness (mobile-first)
On mobile: simple navigation · easy-to-tap buttons · readable text · tables become cards or
careful horizontal scroll · single-column forms · important actions stay visible · avoid tiny
unlabeled icons. Test mentally at 360px, 768px, 1024px, and desktop width.

## 8. Visual polish
Refine: spacing consistency · typography hierarchy · button sizing · border-radius consistency ·
card shadows/borders · icon alignment · empty/loading/error states · form field spacing · header
and footer balance · contrast and readability. Final result should look reviewed by a senior designer.

## 9. Not generic
Avoid AI-template UI: random gradient backgrounds everywhere · oversized purposeless cards ·
inconsistent icons · too many shadows · too many colors · placeholder-like sections · repetitive
dashboard cards · vague CTAs like "Learn More" when a specific action is better. Make it specific
to StudyFlow and its student users.

## 10. Final frontend review
Review like a senior product engineer. Find and fix: UX friction · inconsistent spacing · weak
hierarchy · confusing actions · missing loading/empty states · poor mobile layout · accessibility
issues · overcomplicated UI · components that should be reused · anything that feels unfinished.
Return a polished final version, not just a functional one.

---

## All-in-one (the distilled essence)

> Build a production-ready frontend for this webapp. Act as a senior frontend engineer, UI
> designer, and UX reviewer. The app must be professional, polished, user-friendly, responsive,
> accessible, fast, visually consistent, and easy to navigate. Use a clear design system, reusable
> components, semantic HTML, strong visual hierarchy, mobile-first responsive layouts, smooth but
> subtle interactions, and complete loading/error/empty states. Before finalizing, audit the UI for
> spacing, hierarchy, accessibility, responsiveness, and product clarity. Fix anything that feels
> generic, unfinished, inconsistent, or confusing. Do not just make it work. Make it feel like a
> real product.

## StudyFlow-specific note
Each builder cycle is ONE isolated single-item PR. **Extend the existing design system; never
reinvent it per-PR** — reuse tokens in `tailwind.config` + `src/app/globals.css` and existing
components in `src/components/`. If a token or variant is missing, add it to the shared system
rather than hardcoding inline, so the app stays coherent across many small PRs.
