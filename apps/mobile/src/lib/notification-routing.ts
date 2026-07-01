/** Map a backend push `url` (web path) to the mobile route to navigate to on tap.
 *  Returns null when there's no matching route (the app just opens). */
const ROUTES: Record<string, string> = {
  '/chat': '/',
  '/': '/',
  '/dashboard': '/dashboard',
  '/budgets': '/dashboard',
  '/transactions': '/transactions',
  '/streaks': '/streaks',
  '/settings': '/settings',
};

export function mapUrlToRoute(url: string | null): string | null {
  if (!url) return null;
  const path = (url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  return ROUTES[path] ?? null;
}
