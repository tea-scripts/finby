// Injected transport contracts for @finby/core API factories. The web app
// supplies these from its Zustand store / http client; a future mobile app
// supplies its own equivalents. Keeping them injected is what makes the API
// layer platform-agnostic.
export type AuthedFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
export type AuthedStream = (path: string, init?: RequestInit) => Promise<Response>;
