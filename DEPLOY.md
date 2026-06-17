# Deploying StudyFlow (Railway + Postgres + Google sign-in)

This covers the production deploy with real authentication. Locally and on the
Pi, the app runs with `ALLOW_DEV_USER=1` and SQLite — no Google creds needed.

The default datasource in `prisma/schema.prisma` is `sqlite` so everything stays
testable locally. Production swaps it to `postgresql` (one line — see step 3).

## 1. Google Cloud OAuth (Web client)

1. Go to https://console.cloud.google.com/ and create (or pick) a project.
2. APIs & Services -> OAuth consent screen: configure it (External), add your
   email as a test user while in "Testing", and the `email`, `profile`,
   `openid` scopes (the defaults).
3. APIs & Services -> Credentials -> Create credentials -> OAuth client ID ->
   Application type: **Web application**.
4. Add **Authorized redirect URIs** (exact, no trailing slash):
   - Production: `https://<your-domain>/api/auth/callback/google`
     (e.g. `https://studyflow.up.railway.app/api/auth/callback/google`)
   - Local dev: `http://localhost:3000/api/auth/callback/google`
5. Copy the generated **Client ID** -> `AUTH_GOOGLE_ID` and
   **Client secret** -> `AUTH_GOOGLE_SECRET`.

After deploy, when you know the final Railway domain, come back and make sure its
exact `https://<domain>/api/auth/callback/google` URI is listed here.

## 2. Railway: project + Postgres

1. Create a new Railway project from this repo. Railway reads `railway.json`:
   it builds the `Dockerfile` and starts with `node server.js`, healthchecking
   `/`.
2. In the project, **Add -> Database -> PostgreSQL**. Railway provisions it and
   exposes a `DATABASE_URL` reference variable.
3. On the **app service** (not the DB), set `DATABASE_URL` to reference the
   Postgres plugin's connection string (Railway: `${{Postgres.DATABASE_URL}}`).

## 3. Flip Prisma to Postgres + migrate (production only)

In `prisma/schema.prisma`, change the datasource provider:

```prisma
datasource db {
  provider = "postgresql"   // was: "sqlite"
  url      = env("DATABASE_URL")
}
```

Then apply the migrations against the production database:

```bash
DATABASE_URL="<railway-postgres-url>" npx prisma migrate deploy
```

The committed migrations (`prisma/migrations/*`) include `5_add_auth_tables`
(Account / Session / VerificationToken + User.emailVerified/image). `migrate
deploy` runs them in order with no prompts. Seed the module catalog if wanted:
`DATABASE_URL=... npx tsx prisma/seedCatalog.ts`.

> Note: the SQL in the existing migration files uses SQLite syntax. For a clean
> Postgres deploy you can either keep the provider on `postgresql` and let
> `prisma migrate deploy` apply them (Prisma adapts the standard DDL), or
> regenerate a fresh baseline with `prisma migrate diff` once on Postgres.

## 4. Required environment variables (Railway app service)

| Variable             | Required | Notes                                                        |
| -------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`       | yes      | Postgres connection string (reference the Railway plugin).   |
| `AUTH_SECRET`        | yes      | `npx auth secret` or `openssl rand -base64 33`.              |
| `AUTH_GOOGLE_ID`     | yes      | Google OAuth Web client ID (step 1).                         |
| `AUTH_GOOGLE_SECRET` | yes      | Google OAuth Web client secret (step 1).                     |
| `ALLOW_DEV_USER`     | no       | Do **not** set in production — leaving it unset enforces real sign-in. |
| `AUTH_URL`           | maybe    | Set to `https://<your-domain>` if Auth.js can't infer it behind Railway's proxy. |

Optional features (AI import, web push, reminders) use the same vars documented
in `.env.example` — all safe to leave blank.

## 5. Verify after deploy

- Visit `/` (public) — loads.
- Visit `/today` while signed out — redirects to `/login`.
- Click "Sign in with Google" — completes the OAuth round-trip and lands on
  `/today` as your real Google user.
- `/settings` shows your email + a working "Sign out".
