import type { Category } from '@finby/shared';

/** Map the model's category name onto the workspace's real categories; unknown
 *  names land on "Other" (or uncategorized `''` if that's missing too). */
export function resolveCategoryId(categories: Category[], name: string): string {
  const active = categories.filter((c) => !c.isArchived);
  const match = active.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  return active.find((c) => c.name.toLowerCase() === 'other')?.id ?? '';
}
