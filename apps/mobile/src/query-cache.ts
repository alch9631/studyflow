type Snapshot<T = unknown> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
};
type Entry = {
  snapshot: Snapshot;
  updatedAt: number;
  day: string;
  generation: number;
  pending?: Promise<void>;
};
const EMPTY: Snapshot = { data: null, error: null, loading: true };

/** Device-memory cache only. Credentials and account data are never written to disk. */
export class MobileQueryCache {
  private entries = new Map<string, Entry>();
  private listeners = new Map<() => void, string>();
  constructor(private now = Date.now, private ttl = 60_000, private limit = 40) {}

  snapshot<T>(path: string): Snapshot<T> {
    return (this.entries.get(path)?.snapshot ?? EMPTY) as Snapshot<T>;
  }
  subscribe = (path: string, listener: () => void) => {
    this.listeners.set(listener, path);
    return () => { this.listeners.delete(listener); };
  };
  private emit() { this.listeners.forEach((_path, listener) => listener()); }
  private day() { return new Date(this.now()).toDateString(); }

  load<T>(path: string, fetcher: () => Promise<T>, force = false): Promise<void> {
    let entry = this.entries.get(path);
    if (entry) { this.entries.delete(path); this.entries.set(path, entry); }
    if (entry?.pending) return entry.pending;
    if (!force && entry && entry.snapshot.data !== null && entry.updatedAt > 0 &&
      this.now() - entry.updatedAt < this.ttl && entry.day === this.day()) return Promise.resolve();
    if (!entry) {
      entry = { snapshot: EMPTY, updatedAt: 0, day: "", generation: 0 };
      this.entries.set(path, entry);
    }
    // Touch on access; keep subscriptions and pending work even at the size limit.
    this.entries.delete(path);
    this.entries.set(path, entry);
    const current = entry;
    const generation = ++current.generation;
    const requestDay = this.day();
    current.snapshot = { ...current.snapshot, error: null, loading: true };
    const valid = () => this.entries.get(path) === current && current.generation === generation;
    current.pending = Promise.resolve().then(fetcher).then(data => {
      if (!valid()) return;
      current.updatedAt = this.now(); current.day = requestDay;
      current.snapshot = { data, error: null, loading: false };
    }, error => {
      if (!valid()) return;
      current.snapshot = { ...current.snapshot, error: error instanceof Error ? error : new Error("Couldn't load your data."), loading: false };
      throw error;
    }).finally(() => {
      if (!valid()) return;
      current.pending = undefined;
      this.prune(); this.emit();
    });
    this.emit();
    return current.pending;
  }

  setError(path: string, message: string | null) {
    const entry = this.entries.get(path);
    if (!entry) return;
    entry.snapshot = { ...entry.snapshot, error: message ? new Error(message) : null };
    this.emit();
  }
  invalidate() {
    for (const entry of this.entries.values()) {
      entry.updatedAt = 0; entry.generation++; entry.pending = undefined;
      entry.snapshot = { ...entry.snapshot, loading: false };
    }
    this.emit();
  }
  clear() { this.entries.clear(); this.emit(); }
  private prune() {
    const observed = new Set(this.listeners.values());
    for (const [path, entry] of this.entries) {
      if (this.entries.size <= this.limit) break;
      if (!entry.pending && !observed.has(path)) this.entries.delete(path);
    }
  }
}

const sessions = new Map<string, MobileQueryCache>();
const key = (server: string, token: string) => JSON.stringify([server, token]);
export function sessionCache(server: string, token: string) {
  const identity = key(server, token);
  let cache = sessions.get(identity);
  if (!cache) { cache = new MobileQueryCache(); sessions.set(identity, cache); }
  return cache;
}
export function invalidateSessionCache(server: string, token: string) { sessions.get(key(server, token))?.invalidate(); }
export function clearSessionCache(server: string, token: string) {
  const identity = key(server, token);
  sessions.get(identity)?.clear(); sessions.delete(identity);
}
