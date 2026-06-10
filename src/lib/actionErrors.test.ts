/**
 * Tests for AI failure classification + logging. Run: npx tsx src/lib/actionErrors.test.ts
 */
import {
  classifyAIFailure,
  aiFailureBanner,
  errorMessage,
  logActionError,
} from "./actionErrors";

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

function main() {
  // --- errorMessage ----------------------------------------------------------
  check("errorMessage reads Error.message", errorMessage(new Error("boom")) === "boom");
  check("errorMessage passes a string through", errorMessage("plain") === "plain");
  check(
    "errorMessage reads a message-bearing object",
    errorMessage({ message: "obj msg" }) === "obj msg",
  );
  check("errorMessage stringifies the rest", errorMessage(42) === "42");

  // --- not-configured path ---------------------------------------------------
  check(
    "our 'No AI key set' guard → unconfigured",
    classifyAIFailure(
      new Error("No AI key set — add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env"),
    ) === "unconfigured",
  );
  check(
    "a message naming ANTHROPIC_API_KEY → unconfigured",
    classifyAIFailure(new Error("missing ANTHROPIC_API_KEY")) === "unconfigured",
  );
  check(
    "unconfigured maps to the ai-unconfigured banner",
    aiFailureBanner(new Error("No AI key set"), "optimize-failed") === "ai-unconfigured",
  );

  // --- transient path --------------------------------------------------------
  check("HTTP 429 → transient", classifyAIFailure({ status: 429 }) === "transient");
  check("HTTP 503 → transient", classifyAIFailure({ status: 503 }) === "transient");
  check(
    "statusCode 502 → transient",
    classifyAIFailure({ statusCode: 502 }) === "transient",
  );
  check(
    "ECONNRESET code → transient",
    classifyAIFailure({ code: "ECONNRESET" }) === "transient",
  );
  check(
    "'fetch failed' message → transient",
    classifyAIFailure(new Error("fetch failed")) === "transient",
  );
  check(
    "'request timed out' message → transient",
    classifyAIFailure(new Error("Request timed out")) === "transient",
  );
  check(
    "SDK APIConnectionError (by name) → transient",
    classifyAIFailure({ name: "APIConnectionError", message: "could not reach" }) ===
      "transient",
  );
  check(
    "'overloaded' message → transient",
    classifyAIFailure(new Error("Overloaded")) === "transient",
  );
  check(
    "transient maps to the ai-offline banner",
    aiFailureBanner({ status: 503 }, "analyze-error") === "ai-offline",
  );

  // --- genuine-error path (not auth, not network) ----------------------------
  check(
    "a JSON parse error → error",
    classifyAIFailure(new SyntaxError("Unexpected token < in JSON")) === "error",
  );
  check(
    "an unreadable-file error → error",
    classifyAIFailure(new Error("No readable text in that file")) === "error",
  );
  check("HTTP 400 (bad request) is NOT transient", classifyAIFailure({ status: 400 }) === "error");
  check(
    "a real error keeps the caller's generic banner code",
    aiFailureBanner(new Error("boom"), "optimize-failed") === "optimize-failed",
  );

  // --- logging: tags context + kind, never throws, never leaks the raw object ---
  {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      logActionError("reoptimizeCourse", new Error("No AI key set"));
      logActionError("analyzeModuleUpload", { status: 503, message: "busy" });
    } finally {
      console.error = orig;
    }
    check("logActionError tags the action context", lines[0].includes("[action:reoptimizeCourse]"));
    check("logActionError records the unconfigured kind", lines[0].includes("unconfigured"));
    check("logActionError records the transient kind + status", lines[1].includes("transient") && lines[1].includes("status 503"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
