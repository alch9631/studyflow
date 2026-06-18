/**
 * Module-import smoke test for every primary route's page module.
 *
 * This is a CHEAP, import-level guard: it imports each route's `page` module and
 * asserts the module loads and exposes a callable default export. That catches
 * import-time crashes — a bad top-level import, a throwing module-scope const, a
 * renamed/removed default export — the kind of breakage that turns into a blank
 * 500 in production but never shows up in a unit test of a single lib.
 *
 * It deliberately does NOT try to SSR-render the pages: there's no Next.js
 * request runtime under tsx (no `headers()`, no request context, no RSC
 * renderer), so actually invoking these async server components would fail for
 * reasons unrelated to module health. Live 200-status checks for each route
 * happen at deploy (smoke against the running server), not here.
 *
 * Two Next-only bare specifiers (`server-only` / `client-only`) are virtual —
 * Next aliases them at build time and they aren't installed as real packages, so
 * we stub them to a harmless real module before importing any page. This is the
 * same boundary Next erases at build; stubbing it here just lets the module
 * graph load under plain Node/tsx.
 *
 * Pure import-level / no DB queries run (the pages only DEFINE their async
 * component; nothing calls it). Run: npx tsx src/lib/routeSmoke.test.ts
 */
import Module from "node:module";

// ── Stub Next's virtual `server-only` / `client-only` markers ───────────────
// These have no real package on disk (Next resolves them at build), so importing
// a "use server"/server-component module under tsx would otherwise MODULE_NOT_FOUND.
const STUBBED = new Set(["server-only", "client-only"]);
type ResolveFn = (this: unknown, request: string, ...rest: unknown[]) => string;
const moduleInternals = Module as unknown as { _resolveFilename: ResolveFn };
const originalResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (request, ...rest) {
  if (STUBBED.has(request)) {
    // Resolve to any real, side-effect-free builtin so the import is a no-op.
    return originalResolve.call(this, "node:os", ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

// The user-facing routes the nav exposes — each must have a healthy page module.
const ROUTES: ReadonlyArray<readonly [label: string, spec: string]> = [
  ["/", "@/app/page"],
  ["today", "@/app/today/page"],
  ["focus", "@/app/(focus)/focus/page"],
  ["calendar", "@/app/calendar/page"],
  ["courses", "@/app/courses/page"],
  ["insights", "@/app/insights/page"],
  ["settings", "@/app/settings/page"],
  ["catalog", "@/app/catalog/page"],
];

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function run() {
  for (const [label, spec] of ROUTES) {
    let mod: { default?: unknown } | null = null;
    let importError: string | null = null;
    try {
      mod = (await import(spec)) as { default?: unknown };
    } catch (err) {
      importError = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }

    check(`${label}: module imports without throwing`, importError === null);
    if (importError) {
      console.error(`      ${importError}`);
      continue;
    }
    check(`${label}: has a callable default export`, typeof mod?.default === "function");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void run();
