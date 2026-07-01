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
(Account / Session / VerificationToken + User.emailVerified/image). Seed the
module catalog if wanted: `DATABASE_URL=... npx tsx prisma/seedCatalog.ts`.

> **Important — provider mismatch.** The committed migrations were authored on
> SQLite: `prisma/migrations/migration_lock.toml` pins `provider = "sqlite"`,
> and the SQL uses SQLite syntax. Running `prisma migrate deploy` against
> Postgres will **fail with P3019** (datasource provider `postgresql` does not
> match the migration lock's `sqlite`). You cannot just flip the datasource and
> replay these files. For a clean Postgres deploy, generate a fresh baseline on
> the Postgres schema instead:
>
> ```bash
> # 1. Set the datasource provider to "postgresql" (step above).
> # 2. Archive the SQLite-authored migrations (they're not Postgres-portable):
> mv prisma/migrations prisma/migrations.sqlite.bak
> # 3. Create a Postgres baseline from the current schema and apply it:
> DATABASE_URL="<railway-postgres-url>" npx prisma migrate dev --name init
> # (on the deploy host / CI, apply with:)
> DATABASE_URL="<railway-postgres-url>" npx prisma migrate deploy
> ```
>
> Keep the SQLite migrations only if you still deploy SQLite targets (the Pi).

## 4. Required environment variables (Railway app service)

| Variable             | Required | Notes                                                        |
| -------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`       | yes      | Postgres connection string (reference the Railway plugin).   |
| `AUTH_SECRET`        | yes      | `npx auth secret` or `openssl rand -base64 33`.              |
| `AUTH_GOOGLE_ID`     | yes      | Google OAuth Web client ID (step 1).                         |
| `AUTH_GOOGLE_SECRET` | yes      | Google OAuth Web client secret (step 1).                     |
| `ALLOW_DEV_USER`     | no       | Do **not** set in production — leaving it unset enforces real sign-in. Setting it to `1` disables auth and treats every request as the shared seeded dev user (fine for the private Pi, a security hole on a public URL). |
| `AUTH_URL`           | yes\*    | `https://<your-domain>`. Auth.js v5 only auto-trusts the request host on known platforms (e.g. Vercel); behind Railway's proxy it must be told the canonical URL or OAuth callbacks fail with `UntrustedHost`. \*Alternatively set `AUTH_TRUST_HOST=true`. |

Optional features (AI import, web push, reminders) use the same vars documented
in `.env.example` — all safe to leave blank.

> **SQLite on Docker/Railway = data loss.** The Dockerfile's default DB is
> ephemeral. If you deploy with a SQLite `DATABASE_URL`, mount the image's
> `/app/data` volume and point the URL inside it
> (`DATABASE_URL="file:/app/data/prod.db"`); otherwise every redeploy starts
> from an empty DB. Postgres (this guide) avoids the problem entirely.

## 5. Verify after deploy

- Visit `/` (public) — loads.
- Visit `/today` while signed out — redirects to `/login`.
- Click "Sign in with Google" — completes the OAuth round-trip and lands on
  `/today` as your real Google user.
- `/settings` shows your email + a working "Sign out".
