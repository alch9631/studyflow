# Studyflow for iPhone

The primary Studyflow client is an Expo / React Native app. The existing Next.js
project remains the backend and web planner. They share JSON contracts in
`shared/mobile.ts`; database access, AI keys and planning services stay on the server.

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

The backend must already have its normal `.env` and database. For a new checkout,
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

Expo SDK 58 requires **Xcode 26.4 or newer**. Xcode 26.3 cannot compile its Swift
modules. Check Apple’s macOS requirements before installing a newer Xcode.
If this Mac cannot run a compatible Xcode, use the cloud build below.
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
- Focus displays the instruction, source excerpt, recall check and completion goal.
- The optional timer uses wall-clock anchors so it includes time while iOS suspends JS.
- Answers are retained in device-local drafts (separated by server, account and topic),
  and checkpoints sync every 15 seconds, on backgrounding, or on **Save and close**.
- **Finish session** requires checking the goal. **I need more practice** uses the
  existing result service to schedule another attempt. Repeated submissions do not
  toggle a completed session off or count time twice.
- Sign-out removes Keychain credentials immediately and requests revocation of the
  device's server session. If the server is offline, the server token expires normally.

Local drafts survive a network error and can be retried by reopening the session.
There is no complete offline plan cache or automatic queue for finished results yet.
## Native workspace (0.2)

Five tabs expose Today, Calendar, Courses, Exams and More. They use the same account
and database as the web app:

- Exams: remaining exams, month calendar, published university dates and manual
  matching, date edits, final grades, manual pass status and passed modules.
- Progress: root-topic coverage, confidence and notes; focus time, weekly activity,
  study heatmap, weighted grade average, earned ECTS and checked learning evidence.
- Courses: manual creation, university catalog selection, syllabus text import,
  study days/difficulty, plan repair and progress interpretation.
- Materials: native Files/iCloud selection, authenticated original-file access,
  document-derived study plans with a selection/review step, and removal.
- Planning: a native day/week agenda, time assignment, automatic arrangement,
  recurring class timetable, deadlines and plan recovery/undo.
- More: active recall via course progress, study-window/daily-budget preferences,
  Apple Calendar subscription, and opt-in daily local reminders.

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
| `/api/mobile/blocks/:id/result` | POST | Submit checked completion or practice outcome |
| `/api/mobile/materials/:id` | GET | Retrieve an owned original with bearer authentication |
| `/api/mobile/courses` | GET | Owned course summaries and progress |
| `/api/mobile/courses/:id` | GET | Owned topics, notes, materials and deadlines |
| `/api/mobile/exams` | GET | Remaining exams, results and grades |
| `/api/mobile/insights` | GET | Shared analytics and learning evidence |
| `/api/mobile/calendar?week=YYYY-MM-DD` | GET | Week agenda and recurring classes |
| `/api/mobile/catalog?q=…` | GET | Bounded university module search |
| `/api/mobile/preferences` | GET | Study preferences and private calendar subscription token |
| `/api/mobile/actions/:name` | POST | Allowlisted web workflows; JSON fields or bounded file upload |

## Verify

```sh
# From the repository root
npm run test:mobile
npm run test:mobile-workspace
npm run test:proxy
npm run mobile:check

# From apps/mobile
npx expo install --check
npm run export:ios
```

An exported iOS JavaScript/Hermes bundle validates the native module graph. It is not
a signed `.ipa` or proof of simulator/device behavior.

Before an App Store release: add the appropriate additional login option alongside
Google, full account deletion, a privacy policy, production icons, and device-tested
notification/permission flows. Confirm the bundle identifier before creating signing
credentials. None of those release steps are silently handled by a JavaScript export.

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
