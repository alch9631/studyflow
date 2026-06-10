/**
 * The "Apple" priority system: each course gets a 🍏/🟡/🍎 rating from its
 * urgency (how soon the exam is) and workload (remaining study time), so the
 * student instantly sees what to focus on. The scheduler already prioritises by
 * the same factors — this just surfaces it.
 */
export type AppleLevel = "green" | "yellow" | "red";

export type Apple = {
  level: AppleLevel;
  emoji: string;
  label: string;
  cls: string; // tailwind classes for the badge
};

export function appleFor(opts: {
  examDate: Date;
  intense: boolean;
  remainingMinutes: number;
}): Apple {
  const daysLeft = Math.ceil((opts.examDate.getTime() - Date.now()) / 86_400_000);
  const perDay = daysLeft > 0 ? opts.remainingMinutes / daysLeft : opts.remainingMinutes;

  if (opts.intense || daysLeft <= 7 || perDay > 120) {
    return { level: "red", emoji: "🍎", label: "High", cls: "bg-red-100 text-red-700" };
  }
  if (daysLeft <= 21 || perDay > 45) {
    return { level: "yellow", emoji: "🟡", label: "Medium", cls: "bg-yellow-100 text-yellow-800" };
  }
  return { level: "green", emoji: "🍏", label: "On track", cls: "bg-green-100 text-green-700" };
}
