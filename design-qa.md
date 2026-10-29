# Exams overview design QA

final result: passed

## Scope and visual truth

The user selected the month-calendar and proportional timeline concepts, then
requested multiple scrollable months. The combined reference was shown before
implementation. This extends the existing authenticated Exams page.

Local evidence (retained in the task workspace):
- Source: `/home/pipi/studyflow/exams-overview/selected-combined.png` (853 × 1844).
- Implementation: `/home/pipi/studyflow/exams-overview/combined-390-en.png` (390 × 844).
- Same-input comparison: `/home/pipi/studyflow/exams-overview/comparison.png` (812 × 900).

Both views use the same four illustrative exams in light mode. The source was
normalized into a 390 × 844 CSS-pixel frame without stretching; the implementation
was captured at that viewport and DPR 1. Supplementary captures cover 320, 375,
390, 568 landscape, 844 landscape and 1440 pixels, both themes, English/German,
dense periods and WebKit. Evidence contains fake data in an isolated database.

## Findings and fidelity

No actionable P0/P1/P2 findings remain. Independent finish disposition: **ship**.

- Typography: existing Geist and readable product sizes are preserved. Compact
  chart labels truncate inside measured containers; full course names remain in
  the complete list.
- Layout: timeline precedes swipeable months and the list. The larger calendar
  and below-fold rows intentionally preserve real 44 px targets instead of the
  generated reference's smaller cells. Desktop can show multiple months.
- Color: stable course keys connect all three views; numerals pass AA contrast
  in both themes. Existing neutral surfaces and cyan identity remain intact.
- Graphics/icons: the timeline is genuine date-driven SVG geometry, not a
  raster screenshot of UI. Existing Lucide icons and app chrome are preserved.
  Actual UTC day spacing corrects the generated image's approximate geometry.
- Copy: concise localized controls retain source status and refresh recovery.
  Mock-only sample captions are not shown for real saved dates.

Timeline and calendar regions were inspected at readable native size within the
same comparison and supplementary captures; no extra crop was necessary.

## Comparison history

| Earlier finding | Correction | Final evidence |
| --- | --- | --- |
| Long callouts could spill past their label area | Width-constrained native text and compact names | Long-name browser case; narrow captures |
| Next could stay active at the physical desktop scroll end | Resize-aware physical bounds | Desktop end-bound browser case |
| A connector crossed a lower callout | Connectors painted behind same-background label regions | Fresh comparison and finish review |

## Verification

- Full lint, production build and standalone bundle verification passed.
- 11 date/geometry/contrast checks passed; route import smoke checks passed.
- 24 browser checks passed with no uncaught errors: native touch swiping,
  keyboard navigation, date selection/focus, year boundaries, same-day counts,
  multiple desktop months, long names, dense periods, empty state, actual TUHH
  refresh updating both views and on-demand month rendering.
- Existing authentication, ownership, official-date matching and persistence
  paths remain unchanged. No schema changes or new dependencies were needed.

## Follow-up polish and limits

P3 only: gap-label spacing is tight at 320 px but readable; the abbreviated chart
tooltip could expose the complete title. These do not block acceptance.
Manual screen-reader and enlarged-system-text testing were not performed.
Browser checks used Chromium/WebKit emulation, not a physical iPhone.

## Implementation checklist

- [x] Selected concepts combined with scrollable months.
- [x] Real data, source refresh and complete exam list retained.
- [x] Responsive interactions and relevant states verified.
- [x] Source and implementation compared together.
- [x] Material findings resolved and independently reviewed.
