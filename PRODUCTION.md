# Going to production

> **Current reality (keep this honest):** auth is **already built** — NextAuth v5
> (`next-auth@5`) with **Google** as the only provider (`src/auth.ts`), backed by
> the Prisma adapter. There is **no Supabase** anywhere. Local dev and the Pi box
> run SQLite with a dev-user stand-in; the public cloud app runs Postgres with real
> Google sign-in. This doc previously described a Supabase + Vercel plan that was
> never used — ignore any older copy.

## Architecture in one paragraph

Every `prisma.*` read/write is already scoped by `userId`. Who that user is comes
from `getCurrentUserId()` (`src/lib/devUser.ts`): when `ALLOW_DEV_USER=1` it returns
one shared seeded "Dev Student"; otherwise it returns the signed-in Google user's
id from the NextAuth session. So flipping between "single shared account" and
"real multi-user" is purely an env toggle — no code change.

## The two deploy targets

| | **Cloud (public)** | **Pi (personal/dev)** |
|---|---|---|
| Where | Prisma Compute — `cmqjr82wb09th0ddxa6xzwvqa.fra.prisma.build` | Raspberry Pi, `studyflow.service`, Tailscale only |
| Deploy | `@prisma/cli app deploy --branch main --prod` (from the `deploy/prisma-compute` branch) | `ops/deploy.sh` (builds `origin/main`, restarts the systemd unit) |
| DB | Prisma Postgres (`db.prisma.io`, persistent) | SQLite file |
| Schema | `provider = "postgresql"` (on the `deploy/prisma-compute` branch) | `provider = "sqlite"` (on `main`) |
| Auth | Real Google sign-in (`ALLOW_DEV_USER` unset) | Shared Dev Student (`ALLOW_DEV_USER=1`) |

The Postgres-vs-SQLite split is why `deploy/prisma-compute` is **not** merged into
`main`: merging would flip local/Pi to Postgres and break them. The cloud build is
deployed straight from that branch via `--branch main` without touching git `main`.

## Cloud deploy — the real steps

The full, accurate runbook (Google OAuth client, env vars, callback URL) lives in
[DEPLOY.md](DEPLOY.md). In short:

1. Code + schema (`postgresql`) live on `deploy/prisma-compute`.
2. `npx @prisma/cli app deploy --project <id> --app studyflow --branch main --prod --yes`.
3. Production env (baked at build): `DATABASE_URL` (Postgres), `AUTH_SECRET`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NODE_ENV=production`, `ALLOW_DEV_USER=0`,
   plus optional `OPENAI_API_KEY` for the AI importer.

## What still blocks a stranger from signing up

1. **Google OAuth "Testing" mode.** While the consent screen is in Testing, only
   whitelisted test users complete sign-in; everyone else hits "Access blocked."
   The scopes are non-sensitive (`openid profile email`), so **Publish app** in the
   Google Console is enough — no Google review needed. (Console-only; not a code change.)
2. **Catalog seeding on a fresh DB.** The module catalog (`ModuleTemplate`) is
   populated only by `prisma/seedCatalog.ts` (idempotent upsert). The current prod
   DB is seeded, but a brand-new DB would show the empty "not imported" state. On a
   fresh DB run `npm run db:deploy` (migrate + seed) against the prod `DATABASE_URL`.

## AI importer

Set `OPENAI_API_KEY` in the prod env. The importer uses `gpt-4o-mini`
(`src/lib/syllabus.ts`); swap to a stronger model there for higher-quality extraction.
