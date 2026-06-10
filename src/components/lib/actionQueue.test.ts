/**
 * Unit tests for the offline action queue (presentation-layer replay helper).
 * Run: npx tsx src/components/lib/actionQueue.test.ts
 * (Dependency-free, same style as the lib/* suites.)
 */
import {
  toggleKey,
  queueToggle,
  pendingCount,
  hasPending,
  clearQueue,
  flushQueue,
  subscribe,
  setReplayErrorHandler,
  restoreQueue,
  registerReplayAction,
  formDataToFields,
  __setConnectivityProbe,
  __setStorage,
} from "./actionQueue";

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

/** Build a FormData from plain string fields (Node has a global FormData). */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** In-memory stand-in for localStorage (Node has no Web Storage). */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

const STORAGE_KEY = "studyflow.offlineQueue.v1";

async function main() {
  // ---- toggleKey: stable & order-independent --------------------------------
  check(
    "toggleKey is order-independent",
    toggleKey(form({ blockId: "b1", revalidate: "/today" })) ===
      toggleKey(form({ revalidate: "/today", blockId: "b1" })),
  );
  check(
    "toggleKey distinguishes targets",
    toggleKey(form({ blockId: "b1" })) !== toggleKey(form({ blockId: "b2" })),
  );

  // ---- parity collapse ------------------------------------------------------
  clearQueue();
  check("starts empty", pendingCount() === 0);
  check("first queue returns pending=true", queueToggle("b1", () => {}) === true);
  check("one pending", pendingCount() === 1 && hasPending("b1"));
  check("second queue (same key) cancels → false", queueToggle("b1", () => {}) === false);
  check("queue empty after parity cancel", pendingCount() === 0 && !hasPending("b1"));
  check("third queue re-adds (odd → one flip)", queueToggle("b1", () => {}) === true);
  check("one pending again", pendingCount() === 1);

  // ---- independent keys -----------------------------------------------------
  clearQueue();
  queueToggle("b1", () => {});
  queueToggle("b2", () => {});
  check("distinct keys queue side by side", pendingCount() === 2);
  queueToggle("b1", () => {}); // cancels only b1
  check("canceling one leaves the other", pendingCount() === 1 && hasPending("b2"));

  // ---- FIFO replay drains the queue -----------------------------------------
  clearQueue();
  __setConnectivityProbe(() => true); // online
  const order: string[] = [];
  queueToggle("a", () => {
    order.push("a");
  });
  queueToggle("b", () => {
    order.push("b");
  });
  queueToggle("c", () => {
    order.push("c");
  });
  await flushQueue();
  check("flush replays in FIFO order", order.join(",") === "a,b,c");
  check("flush empties the queue", pendingCount() === 0);

  // ---- reentrancy guard (no double-submit on concurrent flush) --------------
  clearQueue();
  let runs = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  queueToggle("slow", async () => {
    runs++;
    await gate; // hold the drain open
  });
  const first = flushQueue(); // starts draining, awaits the gate
  await flushQueue(); // re-entrant call: must be ignored immediately
  check("concurrent flush is ignored (task not started twice)", runs === 1);
  release();
  await first;
  check("task ran exactly once after release", runs === 1 && pendingCount() === 0);

  // ---- failed replay (online) surfaces error + drops, then continues --------
  clearQueue();
  __setConnectivityProbe(() => true); // online → a throw is a genuine failure
  const errors: string[] = [];
  setReplayErrorHandler((key) => errors.push(key));
  let ranAfter = false;
  queueToggle("bad", () => {
    throw new Error("boom");
  });
  queueToggle("good", () => {
    ranAfter = true;
  });
  await flushQueue();
  check("error handler fired for the failed key", errors.join(",") === "bad");
  check("flush continued past the failure", ranAfter);
  check("queue drained despite the failure", pendingCount() === 0);
  setReplayErrorHandler(null);

  // ---- failed replay (offline) re-queues and stops the drain ----------------
  clearQueue();
  __setConnectivityProbe(() => false); // offline
  let laterRan = false;
  queueToggle("first", () => {
    throw new Error("still offline");
  });
  queueToggle("later", () => {
    laterRan = true;
  });
  await flushQueue();
  check("offline failure keeps both items queued", pendingCount() === 2);
  check("offline failure stops before later items", !laterRan);
  check("the failed item is preserved at the front", hasPending("first"));
  __setConnectivityProbe(null);

  // ---- subscribe is notified on changes -------------------------------------
  clearQueue();
  const sizes: number[] = [];
  const unsub = subscribe((n) => sizes.push(n));
  queueToggle("s1", () => {});
  queueToggle("s2", () => {});
  queueToggle("s1", () => {}); // cancel s1 → size back to 1
  unsub();
  queueToggle("s3", () => {}); // after unsub → not recorded
  check("subscribe observed each size change", sizes.join(",") === "1,2,1");
  check("unsubscribe stops notifications", sizes[sizes.length - 1] === 1);

  // ---- persistence: enqueue mirrors a descriptor to storage ----------------
  clearQueue();
  __setConnectivityProbe(() => true); // online
  const store = fakeStorage();
  __setStorage(store);
  const replayed: string[] = [];
  registerReplayAction("toggleBlock", (fd) => {
    replayed.push(String(fd.get("blockId")));
  });
  check(
    "formDataToFields drops nothing for string fields",
    JSON.stringify(formDataToFields(form({ blockId: "b1", revalidate: "/today" }))) ===
      JSON.stringify({ blockId: "b1", revalidate: "/today" }),
  );
  queueToggle("blk:b1", () => {}, {
    actionId: "toggleBlock",
    fields: { blockId: "b1", revalidate: "/today" },
  });
  const saved = store.getItem(STORAGE_KEY);
  check(
    "enqueue persists the descriptor to storage",
    !!saved && saved.includes("b1") && saved.includes("toggleBlock"),
  );
  check(
    "a pure-thunk toggle (no descriptor) is not persisted",
    (queueToggle("ephemeral", () => {}), !store.getItem(STORAGE_KEY)!.includes("ephemeral")),
  );

  // ---- restore: a reload rehydrates the queue from storage ------------------
  // Simulate a reload: in-memory queue is gone but storage survived.
  clearQueue();
  const reloaded = fakeStorage();
  reloaded.setItem(STORAGE_KEY, saved!);
  __setStorage(reloaded);
  restoreQueue();
  check(
    "restore rehydrates the persisted toggle",
    pendingCount() === 1 && hasPending("blk:b1"),
  );
  restoreQueue(); // second restore must not double-add the same key
  check("restore dedupes by key (no double-add)", pendingCount() === 1);

  // ---- restored toggle replays via the registry, then clears storage --------
  await flushQueue();
  check("restored toggle replays via the registered action", replayed.join(",") === "b1");
  check("a drained queue clears persisted storage", !reloaded.getItem(STORAGE_KEY));

  // ---- restored toggle waits for its action to register ---------------------
  clearQueue();
  const pendingStore = fakeStorage();
  pendingStore.setItem(
    STORAGE_KEY,
    JSON.stringify([{ key: "blk:b2", actionId: "notYetRegistered", fields: { blockId: "b2" } }]),
  );
  __setStorage(pendingStore);
  restoreQueue();
  await flushQueue();
  check("flush holds a restored toggle whose action isn't registered", hasPending("blk:b2"));
  registerReplayAction("notYetRegistered", (fd) => {
    replayed.push(`late:${fd.get("blockId")}`);
  });
  await flushQueue();
  check("it replays once the action registers", replayed.includes("late:b2"));
  check("queue is empty after the late replay", pendingCount() === 0);

  __setStorage(null);
  __setConnectivityProbe(null);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
