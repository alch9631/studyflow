/** Keep generated instructions and source references out of compact session titles. */
export function compactSessionLabel(rawTitle: string, kind?: string): { title: string; activity: string; reference: string } {
  const original = rawTitle.trim();
  const prefix = original.match(/^(Read|Recall|Review|Practice|Watch|Solve):\s*/i);
  const withoutActivity = prefix ? original.slice(prefix[0].length).trim() : original;
  const source = withoutActivity.match(/\s*[·•]\s*((?:PDF\s+)?(?:pp?\.|pages?)\s*\d[\d\s,–—-]*|(?:PDF|slides?|chapter)\s+\d[\d\s,–—.-]*)$/i);
  const title = (source ? withoutActivity.slice(0, source.index).trim() : withoutActivity) || original;
  const activity = prefix ? prefix[1][0].toUpperCase() + prefix[1].slice(1).toLowerCase() : kind === "review" ? "Review" : "";
  return { title, activity, reference: source?.[1].trim() ?? "" };
}
