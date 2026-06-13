import type { FxRateProvider, ProviderRate } from './fx-provider.interface';

/**
 * Frankfurter (ECB reference rates, no API key). ~30 major currencies, supports
 * historical lookups by date. Returns null for unsupported pairs (e.g. NGN).
 */
export class FrankfurterProvider implements FxRateProvider {
  readonly name = 'frankfurter';

  constructor(private readonly baseUrl: string) {}

  async getRate(from: string, to: string, date?: string): Promise<ProviderRate | null> {
    const path = date ?? 'latest';
    const response = await fetch(`${this.baseUrl}/${path}?from=${from}&to=${to}`);
    if (response.status === 404) return null; // no data for this date/pair
    if (!response.ok) throw new Error(`frankfurter responded ${response.status}`);

    const data = (await response.json()) as { date: string; rates?: Record<string, number> };
    const value = data.rates?.[to];
    if (value === undefined) return null;

    return { rate: String(value), date: data.date };
  }
}
