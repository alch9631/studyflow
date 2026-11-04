# Studyflow for iPhone

The primary Studyflow client is an Expo / React Native app. The existing Next.js
project remains the backend and web planner. They share JSON contracts in
`shared/mobile.ts`; database access, AI keys and planning services stay on the server.

## Try the demo in Expo Go

From the mobile app directory:

```sh
cd ~/studyflow/iphone/apps/mobile
npm run start:go
```

Open the app in Expo Go and tap **Try demo without signing in**. No account,
Google sign-in, development server address or running backend is required.
The demo uses the normal app screens with local sample courses, exams, classes,
study sessions and notes. You can run the timer, save notes, check learning goals,
practice recall, edit courses and deadlines, and try plan adjustments.

**Settings → Restart demo** restores the samples. **Exit demo** returns to sign-in.
Demo changes reset on exit or app reload and never sync to an account. Demo
sessions have separate draft keys and are never stored as Keychain credentials.
Uploads, AI preparation, live university dates, reminders and Apple Calendar
subscriptions require signing in; the demo labels those features accordingly.

## Compact navigation

Home opens with the date, a short daily summary and the next task. **Start work** or **Resume focus** opens the session-length picker, and **Lock in** starts the timer.
The five icon-only tabs use native SF Symbols and Liquid Glass on iOS 26,
with the system adapting the material to light or dark appearance.
The bar uses native touch transitions and requests scroll minimization where iOS supports it.
Native scroll insets keep content accessible around the bar, including at larger text sizes.

Today shows one session list with progress above it. Tap a session to choose its
length or the status circle to toggle completion. Swipe left for notes and right
for Complete or Reopen. Hold a row for notes or Move to tomorrow. A short
swipe reveals a button; releasing a full swipe across at least 65% of the row
(and at least 160 points) runs that action. The sliders icon opens a
plan-adjustment sheet with a short impact for each choice and the available undo.
Completed rows omit secondary text. Paused sessions moved to Tomorrow retain their
notes and timer, but stop appearing as a resume prompt until that day. Completing
a paused session keeps its working notes and clears the paused state. Session
length has a top-right X, and back navigation uses a circular glass arrow.

Tap a course row to open a resizable sheet with a grabber and close control. **+** offers course creation, the catalog
and syllabus import. Within a course, Topics, Materials and Deadlines are visible
sections in one equal-width bar; the gear beside Deadlines opens course settings. Use
the search icon to find topics and the pen for topic notes. Start a sitting from
Today, Calendar or a topic's details. Visited course sections retain their scroll
position and drafts. Row windows are virtualized, and the full topic list stays scrollable and searchable. The
section marker and content move together, with support for Reduce Motion. Hidden
sections stay out of touch and accessibility navigation.
Topics and deadlines swipe right for completion and left for deletion. Materials
appear below a counted heading; Add material offers the file kind and then opens
Files. Materials swipe left for deletion. Adding a deadline inserts an editable
title/date row in the course sheet. Deletion always asks
for confirmation, and all swipe actions have a visible button or menu alternative.

Calendar leads with a swipeable date strip and compact agenda rows. Tap a session
to study or swipe right to mark done or undone. Hold a session to set its time,
or tap an assigned start time to edit it. Swipe left to clear or assign a time. Arrange applies only to
the selected day and leaves manual times and completed work alone. Courses opens Exams.
Exam cards use clear Liquid Glass with an accessible solid fallback. Tap a module
to edit its synced exam note; long press for date, grade and pass options.
Swipe right to mark done and left to edit the
date. In Results & grades, swipe right to edit a grade and left to unmark a pass.
Unmarking a graded pass confirms clearing its passing grade, so the module really
returns to Remaining. Courses lists active courses first and keeps passed courses searchable.
Insights leads with the weekly chart, with history and detailed statistics optional. Course progress is available inside Courses.
Focus keeps the timer and notes visible; source excerpts, saved notes and the
learning check expand when needed.

Module notes require the backend schema update in
`prisma/migrations/20261103120000_course_exam_notes/` before shipping the new iOS
bundle. Notes are scoped to the signed-in account, and stale edits retain their
text instead of overwriting a newer revision. Demo notes remain in memory.

## Run locally

Use **Node 24** (`.nvmrc` in the repository root). The Expo SDK does not support Node 25.

From the repository root:

```sh
npm install
npm run dev
```

In another terminal:

```sh
cd apps/mobile
npm ci
npm start
```

For a real account, the backend must already have its normal `.env` and database. For a new checkout,
follow the root setup guide first. There are no new schema migrations for this slice.

On an iPhone, set the development server field to your Mac's LAN address, such as
`http://192.168.1.20:3000`. `localhost` on a phone refers to the phone. Both devices
must be on the same network. **Connect local development account** is available only
in development builds, and the server refuses it whenever `NODE_ENV=production`,
including when the existing web-only `ALLOW_DEV_USER` override is enabled.

For a configured server address, copy `.env.example` to `.env` in this directory.
`EXPO_PUBLIC_API_URL` is public configuration. Never put database URLs, AI keys, or
OAuth client secrets in this app.

### iOS development build

Use **Xcode 26.4 or newer** for the default precompiled Expo modules. Xcode 26.3
needs modules built from source and the Swift 6.2 compatibility patch applied by
`npm ci`; see the local release workflow below. Check Apple’s macOS requirements
before installing a newer Xcode.
Apple's command-line tools alone do not include the simulator.

```sh
cd apps/mobile
STUDYFLOW_DEV_NETWORK=1 npm run ios
```

This generates the native `ios/` project. Generated native projects are ignored;
configuration lives in `app.config.ts`. A physical device build also needs signing.
`eas.json` includes development, preview and production profiles for later EAS setup.
An EAS project must be linked to an authenticated Expo account before the first cloud build.

For a quick development-account preview in a compatible Expo Go version:

```sh
npm run start:go
```

Use a development build for the complete browser sign-in/deep-link flow. Production
builds require an HTTPS `EXPO_PUBLIC_API_URL`; development HTTP exceptions are only
included when `STUDYFLOW_DEV_NETWORK=1` is explicitly set.

## First working flow

- Sign in through the system browser, approve the iPhone connection, and return to
  the app. Existing Google/Auth.js configuration is reused on the backend.
- Today loads real owned study blocks, totals and the nearest active exam.
- Today uses the web's priority, resume, daily-capacity and recovery-preview rules.
  Sessions can be checked off, reopened, moved to tomorrow or annotated from Today.
  Missed work stays visible even when today has no sessions.
- Starting from Today or Calendar offers the same 10/30/60/90-minute choices as
  the web. Longer saved sessions remain resumable, and the chosen duration syncs.
- Focus displays the instruction, source excerpt, recall check and completion goal.
- The countdown starts on entry, uses the shared web clock, includes time while
  iOS suspends JS, and stops at the chosen target. Leaving pauses the saved clock.
- Answers are retained in device-local drafts (separated by server, account and topic),
  and checkpoints sync every 15 seconds, on backgrounding, or on **Save and close**.
- **Finish session** uses the web's session service: it records the time studied,
  keeps the unfinished workload scheduled and does not assert topic mastery.
  **Check learning goal** separately offers checked completion and **I need more
  practice**. Repeated submissions never complete the next sitting or credit time twice.
- Saved notes and note edits share the web's history and stale-edit protection.
  Working notes remain a separate resumable draft. Stable topic links continue
  opening the same logical session after a plan rebuild changes block IDs.
- Sign-out removes Keychain credentials immediately and requests revocation of the
  device's server session. If the server is offline, the server token expires normally.

Local drafts survive a network error and can be retried by reopening the session.
There is no complete offline plan cache or automatic queue for finished results yet.
## Native workspace (0.2)

The iPhone tabs open Home, Today, Calendar, Courses and Insights. Exams is inside Courses, and the gear opens Settings. They use the same account
and database as the web app:

- Exams: remaining exams, month calendar, published university dates and manual
  matching, date edits, final grades, manual pass status and passed modules.
- Progress: root-topic coverage, confidence and notes; focus time, weekly activity,
  study heatmap, weighted grade average, earned ECTS and checked learning evidence.
- Courses: manual creation, university catalog selection, syllabus text import,
  study days/difficulty, plan repair and progress interpretation.
- Materials: native Files/iCloud selection, authenticated original-file access,
  multiple originals per selection, sequential upload progress, retry for failed
  files, document-derived study plans with a selection/review step, and removal.
- Planning: a native day/week agenda, time assignment, automatic arrangement,
  existing class events, deadlines and plan recovery/undo.
- Settings & account: active recall via course progress, study-window/daily-budget preferences,
  Apple Calendar subscription, and opt-in daily local reminders.

Active recall and past-paper practice load the same owned question queue as the
web. Answer keys, original sources and topic mappings agree across clients.
The student writes an answer before revealing it, can skip a question, and can
restart a finished practice run.

Calendar placement uses forms rather than the web's drag interaction. File opening
uses the iOS share/preview sheet. Reminders are scheduled locally on this iPhone;
web push remains a separate browser subscription. Full offline planning and a
background submission queue are still pending.

The native mutation adapter invokes an explicit allowlist of existing web actions.
Only after bearer authentication, AsyncLocalStorage carries that identity into
`getCurrentUserId()` for the duration of the action. It never accepts a user ID
from client fields or headers. Ownership, exam concurrency checks, validation,
rate limits, AI budgets, scheduling and cache invalidation stay in the existing
web/domain implementation. Unknown actions and stale/foreign IDs fail explicitly.

New code should continue to put shared behavior in domain services; the adapter
keeps the current web action workflows consistent while the native client grows.

## Authentication and API

`/mobile/connect` uses the existing browser session and an explicit approval form.
It issues a two-minute, one-use code bound to an S256 PKCE challenge. Only the
registered `studyflow://auth/callback` is allowed in production. The app checks state,
then exchanges the code and verifier for a 30-day revocable device session. Raw bearer
tokens are stored only in the iOS Keychain; the database stores their hashes. Existing
Auth.js `Session` and `VerificationToken` tables support this without a schema change.

All `/api/mobile/*` endpoints authenticate independently of browser cookies and return
JSON 401 responses rather than login redirects. Authenticated responses are no-store.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/mobile/session` | POST | Exchange code/verifier (or development account locally) |
| `/api/mobile/session` | DELETE | Revoke the current device session |
| `/api/mobile/today` | GET | Today's plan and current account |
| `/api/mobile/blocks/:id` | GET | Owned focus-session details |
| `/api/mobile/blocks/:id/progress` | PUT | Save response and elapsed seconds |
| `/api/mobile/blocks/:id/finish` | POST | Finish a sitting using the web session service |
| `/api/mobile/blocks/:id/result` | POST | Submit checked completion or practice outcome |
| `/api/mobile/materials/:id` | GET | Retrieve an owned original with bearer authentication |
| `/api/mobile/courses` | GET | Owned course summaries and progress |
| `/api/mobile/courses/:id` | GET | Owned topics, notes, materials and deadlines |
| `/api/mobile/exams` | GET | Remaining exams, results and grades |
| `/api/mobile/insights` | GET | Shared analytics and learning evidence |
| `/api/mobile/calendar?week=YYYY-MM-DD` | GET | Week agenda and recurring classes |
| `/api/mobile/catalog?q=…` | GET | Bounded university module search |
| `/api/mobile/preferences` | GET | Study preferences and private calendar subscription token |
| `/api/mobile/practice?courseId=…&examFile=…` | GET | Shared recall or optional past-paper queue |
| `/api/mobile/actions/:name` | POST | Allowlisted web workflows; JSON fields or bounded file upload |

## Tab caching and state

Today, Calendar, Courses and workspace detail screens share a session-scoped,
memory-only cache. Revisiting a fresh screen reuses its data for 60 seconds.
Home and Today share one request. Calendar and Courses also start reading on mount, so switching tabs can use data
already loaded in the background. Courses also prefetch the first four displayed
course details on focus and begin any other course read on touch-down.
Stale data stays visible while it refreshes on focus or return from the background.
Pull to refresh always requests current data. Concurrent reads share a request,
failed refreshes keep the last result beside the retry action, and changing the
calendar week or course uses a separate cache entry. A day rollover also expires
cached plans. The cache retains up to 40 unobserved/observed entries combined,
except that mounted screens and in-flight reads are retained until safe to evict.

Successful edits, focus checkpoints and material uploads invalidate the session's
cached reads. A response started before an edit cannot replace newer data. Sign-out
and demo restart clear the previous session's cache; server and session identities
never share cached data. Cached workspace data is not persisted across app launches.

The 48-point icon-only tab bar floats over scrolling content. On supported iPhones
it uses dark Liquid Glass. Reduce Transparency gives it a solid background.
Tab buttons retain their accessibility labels, and scroll padding keeps the last
row reachable. Calendar selection and course search persist when switching tabs.

Liquid Glass is used for navigation menus, plan adjustment, course creation,
calendar week/date controls and section chips. Content cards, lists and forms use solid surfaces.
Custom glass supports both appearances and uses an opaque fallback when Reduce
Transparency is enabled or the native glass APIs are unavailable.

Settings includes the native iOS color picker for a custom app accent. Selection
updates buttons, selected dates, sections, icons and navigation immediately and
persists on this device across app launches and appearance changes. Reset restores
the appearance's default accent. Text on colored controls adjusts for contrast;
very light/dark choices are adjusted only for standalone text and icons. Completed
calendar sessions no longer open a completion page, and stale completed-session
links return to Home.

## Verify

```sh
# From the repository root
npm run test:mobile
npm run test:mobile-workspace
npm run test:mobile-demo
npm run test:mobile-cache
npm run test:proxy
npm run mobile:check

# From apps/mobile
npx expo install --check
npm run export:ios
```

An exported iOS JavaScript/Hermes bundle validates the native module graph. It is not
a signed `.ipa` or proof of simulator/device behavior.

On Linux ARM64, the bundled Hermes compiler currently targets x86-64. Use
`npm run export:ios -- --no-bytecode` for a JavaScript graph check there; keep the
normal bytecode export in CI and signed iOS builds.

The session-length picker uses `@expo/ui`; row swipes use Gesture Handler,
Reanimated and Worklets. Rebuild an existing development client
after pulling these native dependencies (`STUDYFLOW_DEV_NETWORK=1 npm run ios` on a
supported Mac, or the EAS development profile). Existing TestFlight builds do not
include local changes; deploy the updated backend before using a new native build.

### Web/native workflow regression checklist

Use the same account and course in both clients:

- Resume a draft after a replan, including one no longer scheduled today; confirm
  its response, duration and elapsed time survive.
- Start a 30-minute sitting, pause/background/resume it, and finish early. Confirm
  only studied minutes are credited and the unfinished work remains on both plans.
- Save a note, edit it on the other client, and attempt an outdated edit. Confirm
  the newer note survives and the failed editor retains its text.
- Select multiple originals, interrupt one upload, then retry. Confirm successful
  originals are not uploaded twice and past-paper practice opens the right source.
- Preview and apply a plan adjustment; confirm missed work, completed sessions and
  the available undo agree. Delete a deadline and confirm it disappears on the web.
- Fail a data request, then retry it. Confirm an error is not presented as an empty
  course list, and changing courses never briefly shows the previous course's data.

Before an App Store release: add the appropriate additional login option alongside
Google, full account deletion, a privacy policy, production icons, and device-tested
notification/permission flows. Confirm the bundle identifier before creating signing
credentials. None of those release steps are silently handled by a JavaScript export.

## Native experience review

The [2 November 2026 review](../../docs/IOS_UX_REVIEW.md) records the native walkthrough,
confirmed fixes, screenshots, regression checks, and physical-device verification limits.
Topic details can start a sitting directly, and Pause/Resume stays beside
the countdown. Forms protect unsaved edits. Exams and Settings open with Back links
outside the three-tab navigator.

## Local Xcode build and TestFlight

Expo's cloud build service is optional. Node 24, local Xcode and the existing
Apple Developer account can produce and upload the signed app directly.

From `apps/mobile`, select Node 24 and configure the release before generating
the native project:

```sh
# This Mac keeps Xcode in Downloads. Adjust for a different installation.
export DEVELOPER_DIR="$HOME/Downloads/Xcode.app/Contents/Developer"
export EXPO_PUBLIC_API_URL=https://avi-pi.tail76033e.ts.net:8443
export IOS_BUILD_NUMBER=9 # Choose a number greater than the latest TestFlight build.
export EXPO_USE_PRECOMPILED_MODULES=0
npm ci
npx expo prebuild --platform ios

xcodebuild -workspace ios/Studyflow.xcworkspace -scheme Studyflow \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath dist/Studyflow.xcarchive -allowProvisioningUpdates archive

xcodebuild -exportArchive -archivePath dist/Studyflow.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath dist/testflight \
  -allowProvisioningUpdates
```

`ExportOptions.plist` uploads to App Store Connect; Apple then processes the build
for TestFlight. It keeps the explicitly selected build number. The generated
`ios/` project and release output remain ignored. Alternatively, open
`ios/Studyflow.xcworkspace` in Xcode, choose an iOS device destination, then use
**Product → Archive → Distribute App → App Store Connect**.

The versioned `expo-modules-jsi@58.0.21` patch uses Expo's existing synchronous
pointer-capture helper at a call affected by a [Swift 6.2 compiler compatibility
issue](https://github.com/expo/expo/issues/52754). It follows the helper already
used in [Expo's Xcode 26 compatibility fix](https://github.com/expo/expo/pull/51040).
The 75 native JavaScript object tests passed on Xcode 26.3 with this patch.
Remove it when upgrading to an Expo version that includes the fix.

### Build on an external SSD

When internal storage is limited, use a separate release copy on an APFS SSD,
including the root and mobile `node_modules` directories. Keep shared sources
under the same repository layout so Metro and native autolinking resolve them.

Before installing pods, point `TMPDIR` at an existing temporary directory on the
SSD and `CP_CACHE_DIR` at an SSD CocoaPods cache directory. Run `pod install`
from that copy's `apps/mobile/ios` directory. Pass SSD paths to Xcode's
`-derivedDataPath`, `-archivePath`, `-resultBundlePath` and `-exportPath` options.
Keep the same Node 24, backend URL, build number and source-module settings as
the local workflow above. This puts dependency extraction and native build
output on the SSD without relocating the normal development checkout.

## Cloud build and TestFlight

The EAS profiles use the `sdk-58` build image and remote build numbers. Preview and
production builds connect to the existing Pi HTTPS backend, which is publicly
reachable through Tailscale Funnel. The new mobile API must be deployed before
using an iPhone build.

```sh
cd apps/mobile
npx eas-cli@latest login --browser
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Complete account and Apple signing prompts locally in the browser or terminal.
The first submission also needs the app’s App Store Connect record and a paid
Apple Developer membership. A successful upload still needs Apple’s processing
before the build appears in TestFlight. A JavaScript export alone is not an upload.
