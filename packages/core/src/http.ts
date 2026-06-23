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

export interface HttpClient {
  readonly baseUrl: string;
  apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Stateless fetch against the Finby API. Knows nothing about auth state. */
export function createHttpClient(config: { baseUrl: string; fetchImpl?: typeof fetch }): HttpClient {
  const { baseUrl } = config;
  const doFetch = config.fetchImpl ?? fetch;

  async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          // FormData bodies (file uploads) must let the platform set the
          // multipart Content-Type with its boundary — never force JSON there.
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

  return { baseUrl, apiFetch };
}
