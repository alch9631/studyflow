# BE Quality Guide — StudyFlow Backend Standard

Reference pack for the BE builder. The per-cycle `brief-be.tmpl` carries the distilled
"Backend Quality Bar"; this file is the full version for depth.

## StudyFlow reality check (read this first — the generic pack below is adapted to it)
- **Stack:** Next.js 14 App Router. "Backend" = route handlers under `src/app/api/**` + server
  actions + the service/logic layer in `src/lib/**` (planner, planService, dates, ics, syllabus,
  rateLimit, stats, …). Prisma + SQLite locally, Supabase Postgres in prod.
- **No controllers/repositories layer.** Separation of concerns here = thin handlers/actions →
  logic in `src/lib` → Prisma data access inside those services. Do NOT introduce a repository
  abstraction; Prisma-in-service is the established pattern.
- **Auth:** dev-user stand-in (`src/lib/devUser.ts`) locally, **Supabase auth in prod (issue #1)**.
  Do **not** build your own signup/login/password-hashing/JWT — it would collide with Supabase.
  The backend job is to **scope every query by the resolved `userId`** and enforce ownership.
- **Scope discipline:** each cycle is ONE backlog item. Apply these standards to what you touch;
  do not sweep-refactor every endpoint or rewrite the architecture in a single PR.

---

Baseline mindset:

> You are a senior backend engineer building a production-ready backend for a real webapp.
> Prioritize: clean architecture · secure API design · clear database modeling · robust validation
> · good error handling · authentication & authorization · scalable service structure · maintainable
> code · observability through logs · performance-aware queries · complete API documentation.
> Do not write quick prototype code unless explicitly asked. Build as if other engineers will maintain it.

## 1. Architecture
Define modules/domains, API routes, DB models, service responsibilities, validation layer, auth
flow, error-handling strategy, logging strategy, env vars, external integrations — before coding.
Keep business logic out of route handlers. Clean separation: handlers/actions handle HTTP →
services hold logic → Prisma handles persistence → utilities. (StudyFlow: services live in `src/lib`.)

## 2. API design
Predictable route names · correct HTTP methods · proper status codes · validate all inputs ·
consistent response shapes · useful error messages without leaking sensitive details · pagination/
filtering/sorting where needed · protect private routes with auth · enforce authorization on the
backend. **Do not trust frontend input.**

## 3. Database
For each model define: fields · types · required/optional · relations · indexes · unique constraints ·
timestamps · soft delete if useful · ownership/user-access rules. Avoid vague schemas. Don't store
important structured data as random JSON without a strong reason. (StudyFlow already uses JSON
deliberately for things like `Topic.questions` and module data — that's fine.) **Avoid destructive
migrations — never wipe `prisma/dev.db` or switch DB provider.**

## 4. Security
Hash passwords properly (— but in StudyFlow auth is Supabase, so don't hand-roll this) · never store
plaintext secrets · env vars for sensitive config · validate & sanitize inputs · prevent injection
(Prisma parameterizes — don't build raw string queries) · authorization checks for user-owned
resources · rate-limit sensitive endpoints (`src/lib/rateLimit.ts` exists) · secure cookie/token
handling per the auth strategy · no stack traces in prod responses · don't leak whether private
resources exist unless appropriate.

## 5. Authentication
Production apps want signup/login/logout/current-user/hashing/token-session/protected-route
middleware/role-or-ownership authz/clear auth errors/secure expired-token handling — **but for
StudyFlow this is Supabase's job (issue #1), not yours to reinvent.** Your responsibility: resolve
the current user, enforce auth on the backend (not just hidden in the frontend), and scope data by
`userId`.

## 6. Error handling
Centralized, consistent shape. Support validation / authentication / authorization / not-found /
conflict / rate-limit / unexpected-server errors. Example shape:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data", "details": [] } }
```

Don't return messy raw framework errors. (In StudyFlow, match existing conventions — server actions
return `{ error }` for `useActionState`; new API routes can adopt the shape above. Don't refactor
every existing endpoint in one cycle.)

## 7. Validation
Validate body · query params · route params · headers where needed. Reject invalid data before
business logic. Use schema validation (zod) where possible. Clear messages the frontend can display.

## 8. Performance
Avoid N+1 (use Prisma `include`/`select`) · add indexes for common lookups · paginate list
endpoints · don't return unnecessary fields · keep expensive work out of the request lifecycle when
possible · cache where it clearly helps · explicit, efficient queries. Don't over-engineer; avoid
obviously slow designs.

## 9. Testing
Cover: successful requests · validation failures · auth failures · authorization failures ·
not-found · DB constraints · edge cases · critical business rules. Test behavior, not implementation.
(StudyFlow runs `*.test.ts` via tsx — `test:engine`, `test:service`, `test:dates`, `test:ics`,
`test:stats`. Add a `test:*` script for any new lib; the loop gates merge on these passing.)

## 10. Documentation
Setup instructions · env vars · DB setup/migrations · available scripts · API endpoints · request
examples · response examples · auth requirements · common error codes. A new dev should run and use
the backend without guessing.

---

## All-in-one (the distilled essence)

> Build a production-ready backend for this webapp. Act as a senior backend engineer and system
> designer. Include clean modular architecture, secure auth, proper authorization, a well-designed DB
> schema, validated API inputs, consistent API responses, centralized error handling, efficient
> queries, env-based config, useful logging, tests for critical behavior, and clear API docs. Use
> separation of concerns: handlers handle HTTP only, services contain business logic, the data layer
> handles persistence, middleware handles auth/validation/logging/errors. Before finalizing, audit for
> security, scalability, maintainability, correctness, and DX. Fix anything prototype-level, unsafe,
> duplicated, inconsistent, or unclear. Do not just make it work. Make it safe, clean, maintainable.

## FE + BE coordination (lane handshake)
The FE agent runs in parallel and must render what you return without guessing. Ensure:
frontend-friendly response shapes · displayable error messages · loading/empty/error states are
serviceable · pagination metadata included · auth state restorable on refresh · file uploads, forms,
and filters handled predictably · API docs/types match the actual implementation.
