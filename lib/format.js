// ────────────────────────────────────────────────────────────────────────────
// Money formatting helpers — single source of truth so we never accidentally
// fall back to $ when the project is actually in AED, EUR, etc.
//
// Symbols cover the currency list in pages/api/custom-values.js. Anything
// outside the list shows the ISO code as a prefix (e.g. "ZAR 250K") rather
// than picking a wrong symbol.
// ────────────────────────────────────────────────────────────────────────────

const SYMBOL_BY_CCY = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'CHF ',
  JPY: '¥',
  CNY: '¥',
  SGD: 'S$',
  HKD: 'HK$',
  AED: 'AED ',
  SAR: 'SAR ',
  ZAR: 'R',
  INR: '₹',
  KRW: '₩',
  TRY: '₺',
  BRL: 'R$',
  MXN: 'MX$',
  RUB: '₽',
};

// Returns the currency symbol or "ISO " prefix as a fallback.
function currencySymbol(currency) {
  if (!currency) return '£';
  const code = String(currency).toUpperCase();
  return SYMBOL_BY_CCY[code] || (code + ' ');
}

// Format a contract value compactly with the right currency symbol.
// Uses K/M suffixes — 250000 → "£250K", 1500000 → "£1.5M".
function formatMoney(value, currency = 'GBP') {
  const num = Number(value) || 0;
  const sym = currencySymbol(currency);
  if (num === 0) return `${sym}0`;
  if (num >= 1000000) return `${sym}${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${sym}${(num / 1000).toFixed(0)}K`;
  return `${sym}${num.toLocaleString()}`;
}

// Full formatted value with locale grouping — for detail pages and forms
// where the user needs to see the exact number (not 1.5M).
function formatMoneyFull(value, currency = 'GBP') {
  const num = Number(value) || 0;
  const sym = currencySymbol(currency);
  return `${sym}${num.toLocaleString()}`;
}

module.exports = { currencySymbol, formatMoney, formatMoneyFull };
