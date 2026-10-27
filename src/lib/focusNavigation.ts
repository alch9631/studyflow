export function focusHref(blockId: string, topicId?: string, kind?: string): string {
  const params = new URLSearchParams({ blockId });
  if (topicId) params.set("topicId", topicId);
  if (kind) params.set("kind", kind);
  return `/focus?${params}`;
}
