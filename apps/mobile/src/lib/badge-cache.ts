/** Session cache of fetched achievement badge SVGs, keyed by workspace + slug.
 *  Badge art is static, so once the grid has loaded a badge the detail sheet —
 *  a separate `BadgeImage` instance — can render it instantly instead of
 *  re-fetching the same bytes from the server. Lives for the JS session. */
const cache = new Map<string, string>();

const keyOf = (workspaceId: string, slug: string): string => `${workspaceId}:${slug}`;

export function getCachedBadge(workspaceId: string, slug: string): string | undefined {
  return cache.get(keyOf(workspaceId, slug));
}

export function setCachedBadge(workspaceId: string, slug: string, svg: string): void {
  cache.set(keyOf(workspaceId, slug), svg);
}

export function clearBadgeCache(): void {
  cache.clear();
}
