import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui's class-name helper: merge conditional classes (clsx) and resolve
 * conflicting Tailwind utilities so the last one wins (tailwind-merge). Lives
 * under components/ — StudyFlow keeps src/lib/ for server/data logic only.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
