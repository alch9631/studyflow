/** Integer-minute maximum flow. Reverse edges let scarce dates reclaim minutes
 * from flexible work, so greedy course ordering cannot manufacture overload. */
export type AllocationJob = { id: string; minutes: number; dates: string[]; deadline: string; importance: number; preferredDates?: string[] };
type Edge = { to: number; reverse: number; capacity: number; initial: number };

export function allocateMinutes(jobs: AllocationJob[], capacity: Map<string, number>): Map<string, Map<string, number>> {
  const dates = [...capacity.keys()].sort();
  const ordered = [...jobs].sort((a, b) => a.deadline.localeCompare(b.deadline) || a.dates.length - b.dates.length || b.importance - a.importance || a.id.localeCompare(b.id));
  const sink = 1 + ordered.length + dates.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const add = (from: number, to: number, amount: number) => {
    const forward: Edge = { to, reverse: graph[to].length, capacity: amount, initial: amount };
    graph[from].push(forward);
    graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, initial: 0 });
    return forward;
  };
  const dateNodes = new Map(dates.map((date, i) => [date, i + ordered.length + 1]));
  for (const date of dates) add(dateNodes.get(date)!, sink, Math.max(0, Math.floor(capacity.get(date) ?? 0)));
  const links: { job: string; date: string; edge: Edge }[] = [];
  const extras: { node: number; date: string; minutes: number; job: string }[] = [];
  ordered.forEach((job, i) => {
    const node = i + 1;
    add(0, node, Math.max(0, Math.ceil(job.minutes)));
    const allowed = job.dates.filter(date => dateNodes.has(date));
    const preferred = new Set(job.preferredDates ?? allowed);
    const room = allowed.reduce((sum, date) => sum + (preferred.has(date) ? capacity.get(date) ?? 0 : 0), 0);
    // Weighted quotas spread work across actual availability. The second pass
    // removes these soft quotas while preserving hard eligibility/capacity.
    let credit = 0;
    for (const date of allowed) {
      const cap = capacity.get(date) ?? 0;
      credit += preferred.has(date) && room > 0 ? job.minutes * cap / room : 0;
      const quota = Math.min(cap, credit >= 15 ? Math.floor(credit / 15) * 15 : 0);
      credit -= quota;
      if (quota > 0) links.push({ job: job.id, date, edge: add(node, dateNodes.get(date)!, quota) });
      extras.push({ node, date, minutes: cap, job: job.id });
    }
  });
  const flow = () => {
    while (true) {
      const level = new Int32Array(graph.length).fill(-1); level[0] = 0;
      const queue = [0];
      for (let q = 0; q < queue.length; q++) for (const edge of graph[queue[q]]) {
        if (edge.capacity > 0 && level[edge.to] < 0) { level[edge.to] = level[queue[q]] + 1; queue.push(edge.to); }
      }
      if (level[sink] < 0) return;
      const cursor = new Int32Array(graph.length);
      const send = (node: number, amount: number): number => {
        if (node === sink) return amount;
        for (; cursor[node] < graph[node].length; cursor[node]++) {
          const edge = graph[node][cursor[node]];
          if (edge.capacity <= 0 || level[edge.to] !== level[node] + 1) continue;
          const sent = send(edge.to, Math.min(amount, edge.capacity));
          if (sent > 0) { edge.capacity -= sent; graph[edge.to][edge.reverse].capacity += sent; return sent; }
        }
        return 0;
      };
      while (send(0, Number.MAX_SAFE_INTEGER) > 0) { /* augment */ }
    }
  };
  flow();
  for (const extra of extras) links.push({ job: extra.job, date: extra.date, edge: add(extra.node, dateNodes.get(extra.date)!, extra.minutes) });
  flow();
  const result = new Map(jobs.map(job => [job.id, new Map<string, number>()]));
  for (const { job, date, edge } of links) {
    const used = edge.initial - edge.capacity;
    if (used > 0) result.get(job)!.set(date, (result.get(job)!.get(date) ?? 0) + used);
  }
  return result;
}
