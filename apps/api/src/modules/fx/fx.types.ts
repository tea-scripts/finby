export interface FxRate {
  from: string;
  to: string;
  /** 1 `from` = `rate` `to`, as a decimal string. */
  rate: string;
  inverseRate: string;
  /** ISO date (YYYY-MM-DD) the rate applies to. */
  date: string;
  source: string;
  isCached: boolean;
}

export interface FxConversion {
  /** amountOriginal * fxRateUsed, in the target currency. */
  amountBase: string;
  fxRateUsed: string;
  fxRateTimestamp: Date;
  rate: string;
  date: string;
}
