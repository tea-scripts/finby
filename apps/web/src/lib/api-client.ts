import { createHttpClient, ApiError } from '@finby/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export { ApiError };

const http = createHttpClient({ baseUrl: API_BASE });

/** Low-level fetch against the Finby API. Knows nothing about auth state. */
export function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return http.apiFetch<T>(path, init);
}
