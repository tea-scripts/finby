// @finby/core — framework-agnostic transport + formatting kernel shared by
// apps/web and apps/mobile. Never import platform APIs here; inject them.
export const CORE_PACKAGE = '@finby/core';

export { ApiError, createHttpClient } from './http';
export type { HttpClient } from './http';
