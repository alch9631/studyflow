/** Shared bounds for the Today prompt and explicit focus URLs. */
export function sessionLength(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return undefined;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= 600 ? minutes : undefined;
}
