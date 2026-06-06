# Going to production

Local dev runs on SQLite with a dev-user stand-in. To ship for real you need a
Postgres database, real auth, and a deploy. Here's the exact path. ~30–45 min.

> None of this is required to **test** locally — see [START_HERE.md](START_HERE.md).

## 1. Database — Supabase Postgres (~10 min)

1. Create a free project at https://supabase.com → **New project**. Pick a region near you (Frankfurt for Germany).
2. **Project Settings → Database → Connection string → URI.** Copy it.
3. In `.env`, set `DATABASE_URL` to that URI.
4. Switch Prisma to Postgres — in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
5. Create the tables and the client:
   ```bash
   npx prisma migrate dev --name init   # first real migration
   ```
   (Local dev used `db push`; for production, `migrate` gives you a versioned history.)
6. Seed if you like: `npm run db:seed`.

## 2. Auth — Supabase Auth (the one real code step)

Today the app uses `src/lib/devUser.ts` (`getCurrentUserId()`) returning a fixed
user. To make it multi-user:

1. **Project Settings → API** → copy `URL` and `anon` key into `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="ey..."
   ```
2. Add Supabase auth (email magic-link is simplest): a login page + middleware.
   The Supabase Next.js App-Router guide walks this in ~20 min:
   https://supabase.com/docs/guides/auth/server-side/nextjs
3. Replace the body of `getCurrentUserId()` with the Supabase session user id.
   **Nothing else changes** — every `prisma.course` query already scopes by `userId`.

## 3. AI importer — OpenAI key

Add to `.env` (and to Vercel env vars in step 4):
```
OPENAI_API_KEY="sk-..."
```
Get one at https://platform.openai.com/api-keys. The importer uses `gpt-4o-mini`;
swap to `gpt-4o` in `src/lib/syllabus.ts` for higher-quality extraction.

## 4. Deploy — Vercel (~10 min)

1. https://vercel.com → **Add New → Project** → import `alch9631/studyflow`.
2. **Environment Variables** — add `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`.
3. Deploy. Vercel auto-detects Next.js and builds.
4. After first deploy, run the migration against the prod DB once
   (`npx prisma migrate deploy` with the prod `DATABASE_URL`).

That's it — push to `main` and Vercel redeploys automatically.

## Order I'd do it in
DB → deploy with dev-user (see it live fast) → add real auth → turn on AI import.
Deploy early while it's simple; add auth once the deploy works.
