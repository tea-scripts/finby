/** Normalize a raw amount-input string for display: digits + one decimal point,
 *  ≤2 decimals, leading zeros stripped (a lone "0" / "0.xx" kept), integer part
 *  grouped with thousands commas. A trailing "." is preserved so the user can
 *  keep typing decimals. Strip commas before sending to the API. */
export function formatAmountInput(text: string): string {
  // Keep only digits and dots, then collapse to a single decimal point.
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  let intPart = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const hasDot = firstDot !== -1;
  let decPart = hasDot ? cleaned.slice(firstDot + 1).replace(/\./g, '') : '';

  // Strip leading zeros from the integer part, keeping a single "0".
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = hasDot ? '0' : '';

  // Cap decimals at 2 places.
  decPart = decPart.slice(0, 2);

  // Group the integer part with thousands commas.
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (!hasDot) return grouped;
  return `${grouped}.${decPart}`;
}
