# iOS experience review — 2 November 2026

Reviewed from `1f2166f` on an iPhone 17 Pro simulator running iOS 26.3 with Expo Go 58.0.7. Native interactions and accessibility-tree inspection were combined with the shared API, demo, clock, and session tests. Screenshots below were captured and inspected during this review; only sample data is included.

## Outcome and fixes

The main study journey works after the fixes below. The highest-impact defect was a blank plan-adjustment sheet that prevented native recovery actions. This review preserves the existing visual language and shared backend behavior.

| Priority | Finding and evidence | Implemented fix / verification |
| --- | --- | --- |
| P1 | Recovery sheet opened without its choices (step 3). | Replaced the presentation with a native page sheet. Verified Move unfinished work and Undo end to end. |
| P1 | Back silently discarded typed form data (step 7). | Added unsaved-change confirmation, protected in-flight saves, and disabled fields during submission. Verified Keep editing, Save, and Discard using this SDK's supported prevention/retry API. |
| P2 | A course offered no direct study start; empty courses pointed toward materials without an immediate path (steps 4 and 6). | Added course and topic study actions using the existing `startFocus` service, plus an empty-state Add study task action. Verified a course with no materials can open a valid sitting. |
| P2 | Pause was below the focus material and notes (step 4). | Moved Pause/Resume into the timer card. Verified pausing and early completion. |
| P2 | Recall hid Skip until an answer had been revealed (step 5). | Made Skip available throughout the question; report rated and skipped counts honestly, and reset run state when its course or loaded queue changes. |
| P2 | VoiceOver metadata announced five tabs although only three were shown; native menu triggers had no accessible names (steps 2 and 10). | Moved Exams and Settings into the protected stack with Back links; added labels to the native SwiftUI menu itself. Verified “Today, tab, 1 of 3”, “Add course”, “App menu”, and session menu labels in native accessibility output. |
| P2 | Account state was guarded only at the tab layout; mutation authorization failures lacked the read flow's sign-out handling (code inspection; exit verified in step 10). | Protected all account stack routes, reset navigation when credentials change, and handle mutation 401 responses. A late response from an old account cannot sign out a newer one. |
| P2 | Course-specific upload retries and modal state could survive a course-ID change (code inspection). | Key the course workspace by course ID, keeping pending selections, upload retries, and modal state within their originating course. |
| P2 | Demo course starts selected the first topic rather than resuming saved work (regression test). | Align demo starts with chronological/resume behavior, reuse existing sittings, and reject covered or foreign topics. Added a regression covering these cases. |

## Flow evidence

### 1. Entry and offline recovery

Sign-in clearly distinguishes the sample workspace from a real account. An unreachable saved development server shows an error and retry action; Settings remains reachable for sign-out.

<a href="ios-ux-review/01-today-offline.png"><img src="ios-ux-review/01-today-offline.png" width="250" alt="01 today offline"></a>
<a href="ios-ux-review/05-sign-in.png"><img src="ios-ux-review/05-sign-in.png" width="250" alt="05 sign in"></a>

### 2. Today and saved work

Today shows session status and resume affordances. A working note was saved, the sitting was paused and closed, and Today offered Resume. Native menu triggers now have names, and the tab bar announces three tabs.

<a href="ios-ux-review/06-demo-today.png"><img src="ios-ux-review/06-demo-today.png" width="250" alt="06 demo today"></a>
<a href="ios-ux-review/10-saved-note.jpg"><img src="ios-ux-review/10-saved-note.jpg" width="250" alt="10 saved note"></a>
<a href="ios-ux-review/11-resumable-today.jpg"><img src="ios-ux-review/11-resumable-today.jpg" width="250" alt="11 resumable today"></a>
<a href="ios-ux-review/19-navigation-fixed.jpg"><img src="ios-ux-review/19-navigation-fixed.jpg" width="250" alt="19 navigation fixed"></a>

### 3. Recovery and undo

Before the fix, the native adjustment sheet contained only a close control and no usable choices. The replacement sheet exposes the previews. Moving unfinished work changed the plan; Undo restored both pending sessions while preserving completed work.

<a href="ios-ux-review/20-plan-adjustments.jpg"><img src="ios-ux-review/20-plan-adjustments.jpg" width="250" alt="20 plan adjustments"></a>
<a href="ios-ux-review/21-plan-adjustments-fixed.jpg"><img src="ios-ux-review/21-plan-adjustments-fixed.jpg" width="250" alt="21 plan adjustments fixed"></a>

### 4. Starting and controlling focus

The duration picker opens from Today and directly from a course. Starting a course sitting reaches its actual topic. Pause now sits beside the countdown; pressing it changed the clock to Paused. Finishing early returned to Today with the remaining workload retained.

<a href="ios-ux-review/07-session-length.png"><img src="ios-ux-review/07-session-length.png" width="250" alt="07 session length"></a>
<a href="ios-ux-review/08-focus-running.png"><img src="ios-ux-review/08-focus-running.png" width="250" alt="08 focus running"></a>
<a href="ios-ux-review/24-course-study-entry.jpg"><img src="ios-ux-review/24-course-study-entry.jpg" width="250" alt="24 course study entry"></a>
<a href="ios-ux-review/25-timer-controls-fixed.jpg"><img src="ios-ux-review/25-timer-controls-fixed.jpg" width="250" alt="25 timer controls fixed"></a>

### 5. Recall practice

Before the fix, an unanswered question had no Skip action. The revised flow allows skipping before revealing. Skipping both sample questions produced “0 rated · 2 skipped” and correctly stated that no confidence ratings changed. Writing an answer, revealing it, and saving a rating also advanced the queue.

<a href="ios-ux-review/13-practice-before-answer.jpg"><img src="ios-ux-review/13-practice-before-answer.jpg" width="250" alt="13 practice before answer"></a>
<a href="ios-ux-review/26-practice-skip-fixed.jpg"><img src="ios-ux-review/26-practice-skip-fixed.jpg" width="250" alt="26 practice skip fixed"></a>
<a href="ios-ux-review/27-practice-skipped-summary.jpg"><img src="ios-ux-review/27-practice-skipped-summary.jpg" width="250" alt="27 practice skipped summary"></a>

### 6. Courses and materials

Active/passed filtering, topic status, notes/details, and course sections were inspected. Creating a course without topics succeeded. Its empty state now offers Start studying and Add study task, and Start studying opened a valid duration picker. Demo material uploads are explicitly unavailable rather than pretending to save files.

<a href="ios-ux-review/12-course-topics.jpg"><img src="ios-ux-review/12-course-topics.jpg" width="250" alt="12 course topics"></a>
<a href="ios-ux-review/14-materials.jpg"><img src="ios-ux-review/14-materials.jpg" width="250" alt="14 materials"></a>
<a href="ios-ux-review/28-empty-course.jpg"><img src="ios-ux-review/28-empty-course.jpg" width="250" alt="28 empty course"></a>

### 7. Forms and deadlines

An empty deadline title was rejected. Previously, Back silently dropped typed text. The new guard offers Keep editing and Discard. Keep editing retained the text; a subsequent Save returned to the course and showed the new deadline. A separate Discard check exited without creating a deadline.

<a href="ios-ux-review/15-deadline-form.jpg"><img src="ios-ux-review/15-deadline-form.jpg" width="250" alt="15 deadline form"></a>
<a href="ios-ux-review/22-unsaved-form-protected.jpg"><img src="ios-ux-review/22-unsaved-form-protected.jpg" width="250" alt="22 unsaved form protected"></a>
<a href="ios-ux-review/23-deadline-saved.jpg"><img src="ios-ux-review/23-deadline-saved.jpg" width="250" alt="23 deadline saved"></a>

### 8. Calendar, classes, and catalog

The day strip and agenda loaded, including recurring classes. Arrange assigned two pending sessions after the class while leaving completed work alone. The timetable and module-catalog screens were opened and inspected; catalog results remained clearly marked as sample data.

<a href="ios-ux-review/16-calendar.jpg"><img src="ios-ux-review/16-calendar.jpg" width="250" alt="16 calendar"></a>
<a href="ios-ux-review/31-timetable.jpg"><img src="ios-ux-review/31-timetable.jpg" width="250" alt="31 timetable"></a>
<a href="ios-ux-review/32-catalog.jpg"><img src="ios-ux-review/32-catalog.jpg" width="250" alt="32 catalog"></a>

### 9. Exams and insights

Remaining exams, the exam month grid, preparation links, and result-entry affordances were inspected. Insights separates focus time, coverage, and learning evidence, and does not present completion as an exam grade.

<a href="ios-ux-review/17-exams.jpg"><img src="ios-ux-review/17-exams.jpg" width="250" alt="17 exams"></a>
<a href="ios-ux-review/18-insights.jpg"><img src="ios-ux-review/18-insights.jpg" width="250" alt="18 insights"></a>

### 10. Settings and account exit

Settings now has a Back path outside the three-tab navigator. The demo explains which account features require sign-in. Exiting returned to sign-in with the old account screens and their navigation removed.

<a href="ios-ux-review/29-settings-navigation.jpg"><img src="ios-ux-review/29-settings-navigation.jpg" width="250" alt="29 settings navigation"></a>
<a href="ios-ux-review/30-demo-exit.jpg"><img src="ios-ux-review/30-demo-exit.jpg" width="250" alt="30 demo exit"></a>

## Validation

- Mobile TypeScript check passed.
- Root ESLint check passed.
- Expo dependency compatibility check passed using the SDK's installed metadata.
- Production iOS Hermes export passed: 2,054 modules, including the iOS-specific native menu implementation.
- Mobile API: 18 checks passed.
- Native workspace/API: 11 checks passed.
- Demo/API: 11 checks passed, including the new course-start regression.
- Proxy/auth routing: 13 checks passed.
- Shared focus clock and focus-session suites passed, including retries, stale saves, ownership, material sources, and workload conservation.
- Production `/api/health` and `/api/version` returned HTTP 200 on 2 November 2026. Production account data was not changed.

Reproduction commands, using an isolated absolute test database when the root dependencies are symlinked:

```sh
npm run mobile:check
npm run lint -- --quiet
TEST_DATABASE_URL=file:/private/tmp/test-studyflow-mobile-review.db node --import tsx src/lib/mobile.test.ts
TEST_DATABASE_URL=file:/private/tmp/test-studyflow-workspace-review.db node --import tsx src/lib/mobileWorkspace.test.ts
node --import tsx src/lib/mobileDemo.test.ts
node --import tsx src/lib/proxy.test.ts
node --import tsx src/lib/focusClock.test.ts
TEST_DATABASE_URL=file:/private/tmp/test-studyflow-focus-review.db node --import tsx src/lib/focusSession.test.ts
# From apps/mobile, with the production public API URL:
npm run export:ios
```

## Evidence limits and follow-up

This is a native simulator review plus API/service verification, not a physical-device certification or a full WCAG conformance claim. Production Google sign-in/browser return, Files/iCloud selection and original-file sharing, notification permission/delivery, and Apple Calendar subscription still require an authenticated physical-device pass. The demo deliberately does not simulate those system handoffs. Expiry, revocation, ownership, failed uploads, and retry behavior were covered by the service tests rather than a live production account.

Native accessibility names, tab counts, and control states were inspected. Physical VoiceOver speech order, large Dynamic Type, and glass/contrast behavior under every system setting were not certified. The simulator sometimes displayed its software keyboard while a SwiftUI menu was open; the menu remained usable, and that observation should be checked on a physical device before attributing it to the release app.

No backend implementation changed in this release. Course starts use the existing mobile action and the same shared session service as the web client.

## Release

Version **0.2.0 (7)** was archived locally with Xcode 26.3 and uploaded directly to
App Store Connect on 2 November 2026 at 23:31 CET. Apple accepted the package and
reported that it was processing for TestFlight. No Expo cloud build was required.

The release uses `6f7eb8f` plus the versioned Swift 6.2 compatibility patch in
`apps/mobile/patches/`. All 75 native JavaScript object/property tests passed on
the iPhone 17 Pro simulator, and the final mobile type check passed. The
[local build workflow](../apps/mobile/README.md#local-xcode-build-and-testflight)
documents source-module builds and direct Xcode upload.

The signed archive, native test results, build log and accepted upload receipt are
retained locally in the ignored `build/ios/0.2.0-7/` directory. Apple emitted
non-blocking missing debug-symbol warnings for the prebuilt `React.framework`,
`ReactNativeDependencies.framework` and `hermesvm.framework`; crashes inside
those vendor frameworks may not fully symbolicate. The upload itself succeeded.

Original UX-review source SHA-256: `11f79d1c791bb2176b3c42243ff5e3236005d1572231a5f20e11796bbde7295f`. This fingerprint covers the reviewed mobile build inputs and shared contracts, excluding this report and README documentation. The local release record separately identifies the compiler patch and build configuration used for build 7.

## Layout and appearance follow-up

Today now uses the shared page layout from Calendar and Courses, including the
same title row, subtitle, page insets, refresh controls and error recovery. The
dark tab bar blends into the page without its former glass outline or top
separator. Light mode uses a soft warm-white background with quieter dividers
and neutral control fills.

Verified Today, Calendar and Courses in the iPhone 17 Pro simulator, including
both appearance modes, tab navigation, Today refresh and the plan-adjustment
sheet. The mobile TypeScript check, root lint, all 11 mobile demo checks and
production iOS Hermes export passed.

Build **0.2.0 (8)** was archived from `d5327f0` using a separate build copy on an
APFS external SSD. Apple accepted the upload on **3 November 2026 at 00:50 CET**
and reported that the package was processing for TestFlight. All 58 recorded
build inputs matched the verified source before and after archiving. GitHub CI
passed for the release source; the signed archive's version, bundle identifier,
production backend and code signature were verified, and the production
backend health check passed.

The build copy, native dependencies, caches, archive and full logs are retained
at `/Volumes/Ubuntu_VM/StudyflowBuilds/0.2.0-8-d5327f0/`. The upload receipt and
source manifest are also saved in the ignored `build/ios/0.2.0-8/` directory.
The upload had the same three non-blocking vendor debug-symbol warnings listed
for build 7. The [external SSD workflow](../apps/mobile/README.md#build-on-an-external-ssd)
documents the storage setup used for this release.

## Native tabs and cached workspace follow-up — 3 November 2026

Today, Calendar and Courses now share the workspace data cache and use the
system iOS tab bar. Returning to a fresh tab reuses data; stale results remain
visible during revalidation. Edits, focus saves and uploads invalidate cached
reads, while session changes clear account data. The memory cache deduplicates
requests, separates calendar weeks and course IDs, and rejects responses that
started before an edit or sign-out.

The iOS tab bar owns its system material and SF Symbols. Its stable tab identity
preserves screen state through tab and appearance changes. Custom glass is
limited to navigation menus, course creation, plan adjustment and week controls;
content cards and forms use solid surfaces. Custom controls honor Reduce
Transparency and unsupported native APIs with opaque fallbacks.

Verified in Expo Go on the iPhone 17 Pro simulator running iOS 26.3:

- Courses search survived a round trip to Calendar.
- Calendar retained the following week's selected day after switching tabs.
- Completing a sample session on Today updated Calendar's completed row and
  unscheduled count on return.
- Native tabs and glass navigation menus worked in both light and dark mode.
- The final source passed root lint, root/mobile TypeScript checks, the iOS
  Hermes export, 10 cache tests, 11 demo tests, 18 mobile API tests and 11 native
  workspace tests. Dependency checking used Expo's local SDK compatibility map.

These are simulator and automated checks; physical-device behavior and full
VoiceOver navigation remain unverified. Workspace caching lasts for the current
app process and does not add a persistent offline mutation queue.

Build **0.2.0 (9)** was archived and uploaded from the verified working tree on
the external APFS SSD. Apple accepted it on **3 November 2026 at 08:50 CET** and
reported that it was processing for TestFlight. All 62 recorded build inputs
matched the development checkout and release copy after archiving. The signed
archive's version, bundle identifier, production backend, native-tab bundle and
code signature passed verification, and the production health endpoint returned
`{"ok":true}`. The upload retained the same three non-blocking vendor debug-symbol
warnings as builds 7 and 8.

The source copy, dependencies, archive and full build/upload logs are retained at
`/Volumes/Ubuntu_VM/StudyflowBuilds/0.2.0-9/`. The source manifest and accepted upload
receipt are also saved locally in the ignored `build/ios/0.2.0-9/` directory.

## Course sheets, calendar glass and custom accent — 3 November 2026

Removed the completed-session destination. Completed Calendar rows stay in the
agenda without a navigation chevron, and stale completed-session links return to
Today. Course details now use the same resizable native sheet presentation as
Session length, with a grabber and close button. Leaving or finishing Focus
dismisses the sheet stack back to Today.

Calendar's unselected date cards and section controls use the shared Liquid Glass
material, including the existing Reduce Transparency and unsupported-device
fallbacks. Selected controls retain a solid accent fill for reliable contrast.

Settings now has the system iOS color picker, including its grid, spectrum and
sliders. Selection updates the app immediately and saves the custom accent on the
device; Reset restores the current appearance's default. Black/white button labels
and readable standalone text/icon colors keep extreme choices usable. No native
dependencies, backend changes or database migrations were needed.

The iPhone 17 Pro simulator on iOS 26.3 showed the course sheet, its nested session
length/focus flow, dark and light glass date controls, and live purple accent
updates while the system color picker remained open. The final source passed
root lint, root/mobile TypeScript checks, the iOS Hermes export, color validation
and contrast checks, 11 demo tests, 10 cache tests, 18 mobile API tests and 11
workspace tests. Physical-device and full VoiceOver checks remain unverified.

Build **0.2.0 (10)** was archived on the external APFS SSD. Apple accepted the
upload on **3 November 2026 at 10:30 CET** and reported that the package was
processing for TestFlight. The archive's version, bundle identifier, production
backend, code signature, new accent-picker bundle and completion-page removal
passed verification. All 78 recorded source inputs matched the development and
release copies, and the production health check returned `{"ok":true}`. Upload
retained the same three non-blocking vendor debug-symbol warnings as builds 7–9.

An additional cold-launch recheck was interrupted by simulator accessibility and
runtime failures after reboot; the earlier native UI walkthrough completed.
Build sources, dependencies, archive and logs are retained at
`/Volumes/Ubuntu_VM/StudyflowBuilds/0.2.0-10/`. The source manifest, archive
verification and accepted upload receipt are also saved locally in the ignored
`build/ios/0.2.0-10/` directory.

## Task gestures and compact screens — 3 November 2026

The shared row now uses one horizontal gesture with separate revealed action
buttons. Short swipes reveal controls and deliberate full swipes run the matching
action on release; interrupted gestures close without a mutation. Paused work
moved to Tomorrow retains its notes, elapsed time and duration, and its resume
prompt waits until that day. A late older checkpoint cannot undo that deferral.
Completing paused work saves its working notes and clears the paused state.

Today omits completed-row metadata and repeated Resume/Review text. Session
length has a top-right glass X. Tab pages reserve a clear area below scrolling
content for the system tab bar. Course sections share one equal-width bar, with
settings in the header, coverage under Topics, a single materials toolbar, and
unfinished deadlines sorted by date.

Remaining exams swipe right to mark done and left to edit the date. Results
swipe right to edit grades and left to unmark passed. Unmarking a graded pass
confirms clearing its passing grade, so the module returns to Remaining. Info
buttons retain published-date details, matching and equivalent tap actions in
place of exam menus. Other information disclosures use small info controls, and
back navigation uses glass arrows. Action menus omit repeated grey section titles.

Root lint, root/mobile TypeScript, the iOS Hermes export, and 127 targeted checks
passed across mobile API, workspace, demo, cache, pass rules and study-loop suites.
Native simulator screenshots verified Today, the session-length X, Exams, and the
glass back arrow; accessibility inspection verified info disclosure, result
confirmation and the course section controls. Gesture automation emitted a
zero-distance cancelled drag and also failed to move the native duration wheel,
so physical-device swipe verification remains outstanding. The simulator later
timed out during capture.

The web webpack build compiled, type-checked and generated its pages. Final
standalone packaging was blocked by this checkout's externally symlinked
dependencies and an attempted output path outside the workspace; the default
Turbopack build could not resolve Next through that external dependency path.
No native release upload or backend deployment was performed in this change.

## Screen simplification and module notes — 3 November 2026

Exams uses clear Liquid Glass cards, omits University date status, About grades
and per-module info icons, and opens an editable module note on tap. Long press
retains exam/result options. Notes sync through an owned, bounded action with
atomic revision checks; clearing a note also advances its revision. The additive
Course schema migration must ship with the backend before the new iOS bundle.

Today and Calendar separate activity/page references from compact two-line task
titles. Today has direct note buttons. Calendar has direct time controls and a
right-swipe done/undone action that stays enabled for completed sessions. Focus
keeps its timer and notes prominent and expands source excerpts, saved notes and
learning checks on demand. Course sheet titles use their full width at a smaller
size, the settings gear sits beside Deadlines, Add material selects a kind before
opening Files, and adding a deadline inserts an editable title/date row.

Verified in Expo Go on the iPhone 17 Pro simulator with iOS 26.3: compact Today
rows and note buttons; Exams without info icons; module note save and reopen;
inline deadline add/save in the same course sheet; long course-title wrapping;
Focus pause and saved return to Today; Calendar mark-done and mark-undone via its
status control. Native screenshots were inspected during the walkthrough.
The automation drag opened a session instead of producing a measurable swipe,
so physical-device swipe verification remains outstanding. Signed-in Files upload
and cross-device note UI were not exercised; API checks cover owned note reads,
save/clear, conflicts, concurrent saves and foreign-course rejection.

Root lint, root/mobile TypeScript, the iOS Hermes export, 18 mobile API checks,
14 workspace checks, 17 demo checks, 13 cache/gesture checks and the focus clock,
notes and session suites passed. No release upload or backend deployment was
performed. Implementation used the starred repositories' Expo UI/native UI and
Vercel React Native skill guidance.

## Native course motion and measured rendering — 4 November 2026

Integrated the native bottom tabs from `59ea62e`, preserving the completed Home,
Calendar and Insights changes from the other session. Implementation follows
[Vercel's React Native skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-native-skills/SKILL.md),
including native navigation, bounded list rendering, stable row callbacks and
transform-based animation.

Course selection and content share a 240 ms UI-thread transition. The marker
moves with the incoming section's directional slide; Reduce Motion uses the
system setting. Each visited section retains its viewport and local form state.
Inactive sections reject touches and leave accessibility navigation. Topic,
material and deadline rows use FlatList windows and memoized cells. All topics
remain scrollable and searchable without a forty-row pagination barrier.

A controlled iPhone 17 Pro / iOS 26.3 simulator comparison used production,
minified JavaScript in Expo Go, with `__DEV__` verified false. Both versions used
the same native-tab commit and a fixture with 120 topics, 24 materials and 12
deadlines. After one cold round, ten section changes each sampled approximately
1.1 seconds of JavaScript and UI-thread callback intervals.

| Course measurement | Before | After |
| --- | ---: | ---: |
| Median of each change's peak JS interval | 227.2 ms | 23.1 ms |
| Median of each change's peak UI interval | 218.0 ms | 16.7 ms |
| UI intervals exceeding 25 ms, over ten changes | 12 | 0 |
| Initial course-open peak JS interval | 701.8 ms | 180.7 ms |

[Raw samples and methodology](ios-course-performance/measurements.json) include
cold results and the sampling definitions. First mounts still produced long
intervals. These measurements describe the simulator's JS and Reanimated
callback cadence, rather than physical-device presentation frames. Temporary
profiling hooks, navigation drivers and fixture changes are excluded from the
application change.

Native XCTest checks passed for section taps, hidden-section accessibility,
retained deadline drafts and topic searches, finding topic 120, completing a
topic, course settings, closing the sheet and navigating the UIKit tab bar. The
animated control keeps its decorative glass outside the touch-target hierarchy;
a native comparison caught and verified that hit-testing fix before delivery.

Final mobile TypeScript, the Hermes iOS export and all 18 mobile demo checks passed.
