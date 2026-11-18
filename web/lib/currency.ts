/**
 * Money in the quote's own currency. A quote without a Currency field is in rupees, grouped the
 * Indian way (2,49,600); others use their own symbol and international grouping (249,600).
 */
export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  AED: { symbol: 'AED ', locale: 'en-AE' },
};

export const currencyCode = (raw: any) => {
  const c = String(raw || '').trim().toUpperCase();
  return CURRENCIES[c] ? c : 'INR';
};

/** "₹2,49,600", "$249,600.50", "€1.250" */
export function money(amount: any, currency?: any) {
  const n = Number(String(amount ?? '').replace(/[^0-9.-]/g, ''));
  const v = Number.isFinite(n) ? n : 0;
  const c = CURRENCIES[currencyCode(currency)];
  return `${c.symbol}${v.toLocaleString(c.locale, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
