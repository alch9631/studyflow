export function focusHref(blockId: string, topicId?: string, kind?: string, minutes?: number): string {
  const params = new URLSearchParams({ blockId });
  if (topicId) params.set("topicId", topicId);
  if (kind) params.set("kind", kind);
  if (minutes !== undefined) params.set("minutes", String(minutes));
  return `/focus?${params}`;
}
