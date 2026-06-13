/** A single FX-rate source. Providers are tried in priority order by FxService. */
export interface ProviderRate {
  /** 1 unit of `from` = `rate` units of `to`, as a decimal string. */
  rate: string;
  /** ISO date (YYYY-MM-DD) the rate actually applies to. */
  date: string;
}

export interface FxRateProvider {
  /** Stable identifier persisted as the rate `source` (e.g. 'exchangerate-api'). */
  readonly name: string;
  /**
   * Resolve a rate for `from`->`to` on `date` (or latest when omitted).
   * Return `null` when this provider cannot price the requested pair/date —
   * the caller falls through to the next provider.
   * Throw only on transient/network errors (caller treats as "try next").
   */
  getRate(from: string, to: string, date?: string): Promise<ProviderRate | null>;
}
