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

Install full Xcode and select it as the developer directory to use the iOS Simulator.
Apple's command-line tools alone do not include the simulator.

```sh
cd apps/mobile
STUDYFLOW_DEV_NETWORK=1 npm run ios
```

This generates the native `ios/` project. Generated native projects are ignored;
configuration lives in `app.config.ts`. A physical device build also needs signing.
`eas.json` includes development, preview and production profiles for later EAS setup.
An EAS project/account has not been created or linked automatically.

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
Course setup is available through **Settings → Open course planner** while native
course management, original-file preview, calendar and reminders are being ported.

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

## Verify

```sh
# From the repository root
npm run test:mobile
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
