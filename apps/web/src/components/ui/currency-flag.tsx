'use client';

import { useState } from 'react';
import { CURRENCIES } from '@finby/shared';

/** Currency code → ISO-3166 alpha-2 (or `eu`) for the vendored circle flags in /public/flags. */
const CURRENCY_COUNTRY: Record<string, string> = {
  USD: 'us', PHP: 'ph', EUR: 'eu', GBP: 'gb', NGN: 'ng', KES: 'ke',
  GHS: 'gh', ZAR: 'za', BWP: 'bw', CAD: 'ca', AUD: 'au', INR: 'in',
  JPY: 'jp', SGD: 'sg', AED: 'ae', CNY: 'cn',
};

/**
 * Circular currency flag. Renders a vendored SVG when the currency is mapped and the
 * asset loads; otherwise falls back to the currency symbol (or code) in a circle.
 * Decorative only — `aria-hidden`; the currency code is shown as text alongside it.
 */
export function CurrencyFlag({
  currency,
  size = 26,
  className = '',
}: {
  currency: string;
  size?: number;
  className?: string;
}) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const country = CURRENCY_COUNTRY[currency];
  const failed = failedFor === currency;

  if (country && !failed) {
    return (
      <img
        src={`/flags/${country}.svg`}
        alt=""
        aria-hidden
        width={size}
        height={size}
        onError={() => setFailedFor(currency)}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-surface-2 font-semibold text-ink ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {symbol}
    </span>
  );
}
