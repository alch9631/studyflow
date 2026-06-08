/**
 * Integration test for the paginated study-block list service.
 *
 * Proves the list endpoint's service layer is BOUNDED and consistent:
 *  - a default page returns at most DEFAULT_PAGE_SIZE rows,
 *  - an over-max pageSize is clamped to MAX_PAGE_SIZE (can't pull everything),
 *  - paging is stable (the total order by date,kind,id is deterministic, so
 *    concatenating consecutive pages reproduces the full ordered set with no
 *    skips/dupes),
 *  - results are scoped to the user (no cross-user leakage),
 *  - the envelope metadata (total, totalPages, hasMore) is correct.
 *
 * Runs against the real SQLite dev DB on an isolated user (same style as
 * todayFetch.test.ts). Run: DATABASE_URL="file:./dev.db" npx tsx src/lib/blockService.test.ts
 */
import { prisma } from "./db";
import { listStudyBlocks } from "./blockService";
import {
  parsePageParams,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination";

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

const TOTAL_BLOCKS = 130; // > DEFAULT_PAGE_SIZE (50) and > MAX_PAGE_SIZE (100)

async function main() {
  const user = await prisma.user.create({
    data: { email: `block-svc-test+${Date.now()}@studyflow.local`, name: "BlockSvcTest" },
  });
  const userId = user.id;

  // A second user with their own blocks, to prove scoping.
  const other = await prisma.user.create({
    data: { email: `block-svc-other+${Date.now()}@studyflow.local`, name: "Other" },
  });

  const examDate = new Date("2026-12-01T00:00:00Z");
  const course = await prisma.course.create({
    data: {
      name: "PaginatedCourse",
      userId,
      examDate,
      topics: { create: [{ title: "T", order: 0 }] },
    },
    include: { topics: true },
  });
  const otherCourse = await prisma.course.create({
    data: {
      name: "OtherCourse",
      userId: other.id,
      examDate,
      topics: { create: [{ title: "OT", order: 0 }] },
    },
    include: { topics: true },
  });

  // Seed TOTAL_BLOCKS blocks on distinct days. Intentionally include two blocks
  // on the SAME date (different kinds) so the kind+id tie-breaker is exercised.
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  const data = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({
    date: new Date(base + i * 86400_000),
    topicTitle: `Block ${i}`,
    minutes: 30,
    kind: i % 2 === 0 ? "study" : "review",
    courseId: course.id,
    topicId: course.topics[0].id,
  }));
  // Add a duplicate-date pair (same day as block 0) to test stable tie-breaking.
  data.push({
    date: new Date(base),
    topicTitle: "SameDay review",
    minutes: 15,
    kind: "review",
    courseId: course.id,
    topicId: course.topics[0].id,
  });
  await prisma.studyBlock.createMany({ data });

  // The other user gets some blocks too — these must never appear in our user's pages.
  await prisma.studyBlock.createMany({
    data: [
      { date: new Date(base), topicTitle: "Other A", minutes: 10, kind: "study", courseId: otherCourse.id, topicId: otherCourse.topics[0].id },
      { date: new Date(base), topicTitle: "Other B", minutes: 10, kind: "review", courseId: otherCourse.id, topicId: otherCourse.topics[0].id },
    ],
  });

  const expectedTotal = TOTAL_BLOCKS + 1; // + the duplicate-date row

  try {
    // ── Default page: bounded to DEFAULT_PAGE_SIZE ──────────────────────────
    const first = await listStudyBlocks(userId, parsePageParams(new URLSearchParams()));
    check("default page returns at most DEFAULT_PAGE_SIZE rows", first.items.length === DEFAULT_PAGE_SIZE);
    check("total counts ALL of the user's blocks", first.total === expectedTotal);
    check("totalPages = ceil(total/pageSize)", first.totalPages === Math.ceil(expectedTotal / DEFAULT_PAGE_SIZE));
    check("hasMore true on first page", first.hasMore === true);
    check("page/pageSize echoed", first.page === 1 && first.pageSize === DEFAULT_PAGE_SIZE);

    // ── Over-max pageSize is clamped (can't pull everything at once) ─────────
    const huge = await listStudyBlocks(userId, parsePageParams(new URLSearchParams({ pageSize: "100000" })));
    check("over-max pageSize clamped to MAX_PAGE_SIZE rows", huge.items.length === MAX_PAGE_SIZE);
    check("clamped pageSize echoed as MAX_PAGE_SIZE", huge.pageSize === MAX_PAGE_SIZE);
    check("clamped page still cannot exceed the full set", huge.items.length < expectedTotal);

    // ── Stable paging: concatenating pages reproduces the full ordered set ──
    const size = 40;
    const allViaPaging: string[] = [];
    let pageNum = 1;
    let guard = 0;
    while (guard++ < 50) {
      const pg = await listStudyBlocks(
        userId,
        parsePageParams(new URLSearchParams({ page: String(pageNum), pageSize: String(size) })),
      );
      allViaPaging.push(...pg.items.map((b) => b.id));
      if (!pg.hasMore) break;
      pageNum++;
    }
    check("paging visited every row exactly once (count)", allViaPaging.length === expectedTotal);
    check("paging produced no duplicate ids", new Set(allViaPaging).size === expectedTotal);

    // Compare against a single ordered fetch using the SAME total order.
    const ordered = await prisma.studyBlock.findMany({
      where: { course: { userId } },
      orderBy: [{ date: "asc" }, { kind: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    check("paged id sequence matches a single ordered fetch (stable order)",
      JSON.stringify(allViaPaging) === JSON.stringify(ordered.map((o) => o.id)));

    // ── Ownership scoping: no cross-user rows ───────────────────────────────
    const allTitles = new Set<string>();
    for (let p = 1; p <= huge.totalPages || p === 1; p++) {
      const pg = await listStudyBlocks(userId, parsePageParams(new URLSearchParams({ page: String(p), pageSize: "100" })));
      pg.items.forEach((b) => allTitles.add(b.topicTitle));
      if (!pg.hasMore) break;
    }
    check("no other-user blocks leak into the page", !allTitles.has("Other A") && !allTitles.has("Other B"));

    // ── Shape audit: only the intended fields ───────────────────────────────
    check("list item exposes only intended fields",
      JSON.stringify(Object.keys(first.items[0]).sort()) ===
        JSON.stringify(["actualMinutes", "completed", "course", "date", "id", "kind", "minutes", "topicTitle"]));
    check("course sub-select is id+name only",
      JSON.stringify(Object.keys(first.items[0].course).sort()) ===
        JSON.stringify(["id", "name"]));

    // ── Empty user: zero-total envelope ─────────────────────────────────────
    const empty = await prisma.user.create({
      data: { email: `block-svc-empty+${Date.now()}@studyflow.local`, name: "Empty" },
    });
    const emptyPage = await listStudyBlocks(empty.id, parsePageParams(new URLSearchParams()));
    check("empty user -> 0 items", emptyPage.items.length === 0);
    check("empty user -> total 0, totalPages 0, hasMore false",
      emptyPage.total === 0 && emptyPage.totalPages === 0 && emptyPage.hasMore === false);
    await prisma.user.delete({ where: { id: empty.id } });
  } finally {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.user.delete({ where: { id: other.id } });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
