export const DEFAULT_API_BASE = 'http://localhost:3001/api/v1';

/** Resolve the API base URL from injected sources (pure + testable). Order:
 *  EXPO_PUBLIC_API_URL env → app.json `extra.apiBase` → localhost default. */
export function resolveApiBase(sources: { envUrl?: string; extraApiBase?: unknown }): string {
  if (sources.envUrl) return sources.envUrl;
  if (typeof sources.extraApiBase === 'string' && sources.extraApiBase.length > 0) {
    return sources.extraApiBase;
  }
  return DEFAULT_API_BASE;
}
