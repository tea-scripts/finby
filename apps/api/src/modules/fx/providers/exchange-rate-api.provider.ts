import type { FxRateProvider, ProviderRate } from './fx-provider.interface';

/**
 * ExchangeRate-API open endpoint (no API key). 160+ currencies incl. NGN/KES/GHS/BWP/AED.
 * Latest rates only — returns null for past-date requests so a historical-capable
 * provider can answer instead. Docs: https://www.exchangerate-api.com/docs/free
 */
export class ExchangeRateApiProvider implements FxRateProvider {
  readonly name = 'exchangerate-api';

  constructor(private readonly baseUrl: string) {}

  async getRate(from: string, to: string, date?: string): Promise<ProviderRate | null> {
    // Contract: callers pass UTC dates (YYYY-MM-DD). The open tier serves only
    // the latest rate, so defer any explicit non-today date to another provider.
    const today = new Date().toISOString().slice(0, 10);
    if (date && date !== today) return null;

    const response = await fetch(`${this.baseUrl}/v6/latest/${from}`);
    if (response.status === 404) return null; // unsupported base currency
    if (!response.ok) throw new Error(`exchangerate-api responded ${response.status}`);

    const data = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (data.result !== 'success' || !data.rates) return null;

    const value = data.rates[to];
    if (value === undefined) return null;

    const rateDate = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString().slice(0, 10)
      : today;
    return { rate: String(value), date: rateDate };
  }
}
