export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Low-level fetch against the Finby API. Knows nothing about auth state. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "We couldn't reach Finby. Please check your connection and try again.");
  }

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(
      res.status,
      body.error ?? 'ERROR',
      body.message ?? 'Something went wrong. Please try again.',
      body.details,
    );
  }
  return data as T;
}
